import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtStrategy, JwtPayload } from '../strategies/jwt.strategy';
import { Role } from '../enums/role.enum';

/**
 * A JwtStrategy é o ponto onde uma sessão vira acesso: se ela recusar demais,
 * ninguém entra; se recusar de menos, o token de quem invadiu continua valendo
 * depois da redefinição de senha. Os dois lados estão cobertos aqui.
 */
describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: {
    tutor: { findUnique: jest.Mock };
    veterinario: { findUnique: jest.Mock };
  };

  const trocaDeSenha = new Date('2026-09-01T10:00:00.000Z');

  beforeEach(async () => {
    prisma = {
      tutor: { findUnique: jest.fn() },
      veterinario: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-secret') },
        },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  describe('sessão válida', () => {
    it('aceita o token de uma conta que nunca trocou de senha', async () => {
      prisma.tutor.findUnique.mockResolvedValue({ passwordChangedAt: null });

      const payload: JwtPayload = {
        sub: 'tutor-1',
        email: 'ana@example.com',
        role: Role.TUTOR,
      };

      await expect(strategy.validate(payload)).resolves.toEqual({
        sub: 'tutor-1',
        email: 'ana@example.com',
        role: Role.TUTOR,
      });
    });

    it('aceita o token emitido na própria troca de senha', async () => {
      prisma.tutor.findUnique.mockResolvedValue({
        passwordChangedAt: trocaDeSenha,
      });

      await expect(
        strategy.validate({
          sub: 'tutor-1',
          role: Role.TUTOR,
          pwd_at: trocaDeSenha.getTime(),
        }),
      ).resolves.toMatchObject({ sub: 'tutor-1' });
    });

    it('procura o veterinário na tabela dele, não na de tutores', async () => {
      prisma.veterinario.findUnique.mockResolvedValue({
        passwordChangedAt: null,
      });

      await expect(
        strategy.validate({ sub: 'vet-1', role: Role.VET }),
      ).resolves.toMatchObject({ role: Role.VET });
      expect(prisma.tutor.findUnique).not.toHaveBeenCalled();
    });

    it('não devolve o carimbo interno no payload (não vaza em /auth/profile)', async () => {
      prisma.tutor.findUnique.mockResolvedValue({
        passwordChangedAt: trocaDeSenha,
      });

      const result = await strategy.validate({
        sub: 'tutor-1',
        role: Role.TUTOR,
        pwd_at: trocaDeSenha.getTime(),
      });

      expect(result).not.toHaveProperty('pwd_at');
    });
  });

  describe('sessão revogada', () => {
    it('recusa o token emitido antes da troca de senha', async () => {
      prisma.tutor.findUnique.mockResolvedValue({
        passwordChangedAt: trocaDeSenha,
      });

      // Token de antes da redefinição: nasceu sem carimbo nenhum.
      await expect(
        strategy.validate({ sub: 'tutor-1', role: Role.TUTOR }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('recusa o token com o carimbo de uma troca anterior', async () => {
      prisma.tutor.findUnique.mockResolvedValue({
        passwordChangedAt: new Date('2026-09-02T10:00:00.000Z'),
      });

      await expect(
        strategy.validate({
          sub: 'tutor-1',
          role: Role.TUTOR,
          pwd_at: trocaDeSenha.getTime(),
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('recusa o token de uma conta que foi apagada', async () => {
      prisma.tutor.findUnique.mockResolvedValue(null);

      await expect(
        strategy.validate({ sub: 'tutor-apagado', role: Role.TUTOR }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
