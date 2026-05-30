import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { VeterinarioService } from '../veterinario.service';

// bcrypt is not installed in the local node_modules (native dependency —
// same issue as auth.service.spec.ts). We mock the entire module so the
// test suite can run without the native binary.
jest.mock(
  'bcrypt',
  () => ({
    hash: jest.fn().mockResolvedValue('hashed-password'),
    compare: jest.fn(),
    __esModule: true,
    default: {
      hash: jest.fn().mockResolvedValue('hashed-password'),
      compare: jest.fn(),
    },
  }),
  { virtual: true },
);

describe('VeterinarioService', () => {
  let service: VeterinarioService;
  let prisma: {
    veterinario: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  const vetFixture = {
    id: 'vet-1',
    nome: 'Dr. Carlos',
    email: 'carlos@vet.com',
    password: 'hashed-password',
    crmv: 'CRMV-CE-12345',
    telefone: '85999999999',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      veterinario: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VeterinarioService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<VeterinarioService>(VeterinarioService);
  });

  describe('create', () => {
    it('should create a veterinario and omit password from response', async () => {
      prisma.veterinario.findUnique.mockResolvedValue(null);
      prisma.veterinario.create.mockResolvedValue(vetFixture);

      const result = await service.create({
        nome: 'Dr. Carlos',
        email: 'carlos@vet.com',
        password: 'secret123',
        crmv: 'CRMV-CE-12345',
        telefone: '85999999999',
      });

      expect(result).not.toHaveProperty('password');
      expect(result.nome).toBe('Dr. Carlos');
      expect(result.crmv).toBe('CRMV-CE-12345');
    });

    it('should throw ConflictException when email is duplicated', async () => {
      prisma.veterinario.findUnique.mockResolvedValueOnce(vetFixture);

      await expect(
        service.create({
          nome: 'Dr. Ana',
          email: 'carlos@vet.com',
          password: 'secret123',
          crmv: 'CRMV-CE-99999',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when CRMV is duplicated', async () => {
      prisma.veterinario.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(vetFixture);

      await expect(
        service.create({
          nome: 'Dr. Ana',
          email: 'ana@vet.com',
          password: 'secret123',
          crmv: 'CRMV-CE-12345',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return a list of veterinarios without passwords', async () => {
      prisma.veterinario.findMany.mockResolvedValue([vetFixture]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('password');
    });
  });

  describe('findById', () => {
    it('should return the veterinario when found', async () => {
      prisma.veterinario.findUnique.mockResolvedValue(vetFixture);

      const result = await service.findById('vet-1');

      expect(result.id).toBe('vet-1');
      expect(result).not.toHaveProperty('password');
    });

    it('should throw NotFoundException when veterinario is missing', async () => {
      prisma.veterinario.findUnique.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update the veterinario', async () => {
      const updated = { ...vetFixture, nome: 'Dr. Carlos Silva' };
      prisma.veterinario.findUnique.mockResolvedValue(vetFixture);
      prisma.veterinario.update.mockResolvedValue(updated);

      const result = await service.update('vet-1', {
        nome: 'Dr. Carlos Silva',
      });

      expect(result.nome).toBe('Dr. Carlos Silva');
      expect(result).not.toHaveProperty('password');
    });

    it('should throw ConflictException when updating to duplicated CRMV', async () => {
      const otherVet = { ...vetFixture, id: 'vet-2' };
      // 1st call: findById, 2nd call: assertUniqueFields (crmv check)
      prisma.veterinario.findUnique
        .mockResolvedValueOnce(vetFixture)
        .mockResolvedValueOnce(otherVet);

      await expect(
        service.update('vet-1', { crmv: 'CRMV-CE-12345' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException when veterinario does not exist', async () => {
      prisma.veterinario.findUnique.mockResolvedValue(null);

      await expect(service.update('missing', { nome: 'Test' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should delete the veterinario', async () => {
      prisma.veterinario.findUnique.mockResolvedValue(vetFixture);
      prisma.veterinario.delete.mockResolvedValue(vetFixture);

      await service.remove('vet-1');

      expect(prisma.veterinario.delete).toHaveBeenCalledWith({
        where: { id: 'vet-1' },
      });
    });

    it('should throw NotFoundException when veterinario does not exist', async () => {
      prisma.veterinario.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
