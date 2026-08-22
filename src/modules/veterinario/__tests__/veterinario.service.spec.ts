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

  describe('findById', () => {
    it('should throw NotFoundException when veterinario is missing', async () => {
      prisma.veterinario.findUnique.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    /** O `data` que chegou no Prisma na primeira (e única) gravação. */
    function dadosGravados(): Record<string, unknown> {
      const [[argumento]] = prisma.veterinario.update.mock.calls as [
        [{ data: Record<string, unknown> }],
      ];
      return argumento.data;
    }

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

    it('derruba a verificação quando o CRMV muda', async () => {
      prisma.veterinario.findUnique
        .mockResolvedValueOnce(vetFixture)
        .mockResolvedValueOnce(null);
      prisma.veterinario.update.mockResolvedValue(vetFixture);

      await service.update('vet-1', { crmv: 'CRMV-SP 54321' });

      // Sem zerar o carimbo, um registro que ninguém conferiu herdaria o
      // acesso clínico conquistado pelo registro anterior (api#113).
      expect(dadosGravados()).toMatchObject({
        crmv: 'CRMV-SP 54321',
        crmvVerifiedAt: null,
        crmvSituacao: null,
      });
    });

    it('mantém a verificação quando o CRMV enviado é o mesmo', async () => {
      prisma.veterinario.findUnique
        .mockResolvedValueOnce(vetFixture)
        .mockResolvedValueOnce(vetFixture);
      prisma.veterinario.update.mockResolvedValue(vetFixture);

      // Salvar o formulário sem mexer no CRMV não pode custar uma nova
      // consulta paga ao conselho.
      await service.update('vet-1', {
        nome: 'Dr. Carlos Silva',
        crmv: vetFixture.crmv,
      });

      expect(dadosGravados()).not.toHaveProperty('crmvVerifiedAt');
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
