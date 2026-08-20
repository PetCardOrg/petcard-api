import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { VeterinarioService } from '../veterinario.service';

// Mock do bcrypt para o teste não pagar o custo do hash real.
// Sem `virtual: true`: bcrypt existe em disco, e marcá-lo como virtual fazia o
// Jest às vezes resolver o módulo real a partir do cache de transform, o que
// derrubava os testes em execuções alternadas (api#107).
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
  __esModule: true,
  default: {
    hash: jest.fn().mockResolvedValue('hashed-password'),
    compare: jest.fn(),
  },
}));

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

  describe('findAll', () => {
    it('should return a list of veterinarios without passwords', async () => {
      prisma.veterinario.findMany.mockResolvedValue([vetFixture]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('password');
    });
  });

  describe('findById', () => {
    it('should throw NotFoundException when veterinario is missing', async () => {
      prisma.veterinario.findUnique.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
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
    it('should throw NotFoundException when veterinario does not exist', async () => {
      prisma.veterinario.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
