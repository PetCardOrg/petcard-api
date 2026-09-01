import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthTokenPurpose } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthTokenService } from '../auth-token.service';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

describe('AuthTokenService', () => {
  let service: AuthTokenService;
  let prisma: {
    authToken: {
      create: jest.Mock;
      deleteMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      authToken: {
        create: jest.fn(),
        deleteMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthTokenService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((_key: string, fallback: number) => fallback),
          },
        },
      ],
    }).compile();

    service = module.get(AuthTokenService);
  });

  describe('issue', () => {
    it('grava só o hash do token e invalida os anteriores do mesmo propósito', async () => {
      const raw = await service.issue(
        'tutor-1',
        AuthTokenPurpose.PASSWORD_RESET,
      );

      expect(prisma.authToken.deleteMany).toHaveBeenCalledWith({
        where: {
          tutorId: 'tutor-1',
          purpose: AuthTokenPurpose.PASSWORD_RESET,
          usedAt: null,
        },
      });

      const [[{ data }]] = prisma.authToken.create.mock.calls as Array<
        [{ data: { tokenHash: string } }]
      >;
      expect(data.tokenHash).toBe(sha256(raw));
      expect(data.tokenHash).not.toBe(raw);
    });
  });

  describe('consume', () => {
    const base = {
      id: 'token-1',
      tutorId: 'tutor-1',
      purpose: AuthTokenPurpose.PASSWORD_RESET,
      usedAt: null as Date | null,
      expiresAt: new Date(Date.now() + 60_000),
    };

    it('valida, marca como usado e devolve o tutor', async () => {
      prisma.authToken.findUnique.mockResolvedValue(base);

      const tutorId = await service.consume(
        'raw',
        AuthTokenPurpose.PASSWORD_RESET,
      );

      expect(tutorId).toBe('tutor-1');
      expect(prisma.authToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'token-1' } }),
      );
    });

    it('recusa token inexistente', async () => {
      prisma.authToken.findUnique.mockResolvedValue(null);

      await expect(
        service.consume('raw', AuthTokenPurpose.PASSWORD_RESET),
      ).rejects.toThrow(BadRequestException);
    });

    it('recusa token de outro propósito', async () => {
      prisma.authToken.findUnique.mockResolvedValue({
        ...base,
        purpose: AuthTokenPurpose.EMAIL_VERIFICATION,
      });

      await expect(
        service.consume('raw', AuthTokenPurpose.PASSWORD_RESET),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.authToken.update).not.toHaveBeenCalled();
    });

    it('recusa token já usado', async () => {
      prisma.authToken.findUnique.mockResolvedValue({
        ...base,
        usedAt: new Date(),
      });

      await expect(
        service.consume('raw', AuthTokenPurpose.PASSWORD_RESET),
      ).rejects.toThrow(BadRequestException);
    });

    it('recusa token expirado', async () => {
      prisma.authToken.findUnique.mockResolvedValue({
        ...base,
        expiresAt: new Date(Date.now() - 1_000),
      });

      await expect(
        service.consume('raw', AuthTokenPurpose.PASSWORD_RESET),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
