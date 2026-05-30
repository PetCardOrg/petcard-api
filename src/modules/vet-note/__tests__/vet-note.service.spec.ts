import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { VetNoteService } from '../vet-note.service';

describe('VetNoteService', () => {
  let service: VetNoteService;
  let prisma: {
    notaClinica: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
    pet: { findUnique: jest.Mock };
    veterinario: { findUnique: jest.Mock };
  };

  const vetFixture = {
    id: 'vet-1',
    nome: 'Dr. Carlos',
    crmv: 'CRMV-CE-12345',
  };

  const notaFixture = {
    id: 'nota-1',
    petId: 'pet-1',
    veterinarioId: 'vet-1',
    googlePlaceId: null,
    diagnostico: 'Otite externa',
    prescricao: 'Antibiotico topico',
    observacoes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    veterinario: { nome: 'Dr. Carlos', crmv: 'CRMV-CE-12345' },
  };

  beforeEach(async () => {
    prisma = {
      notaClinica: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      pet: { findUnique: jest.fn() },
      veterinario: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [VetNoteService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<VetNoteService>(VetNoteService);
  });

  describe('create', () => {
    it('should create a clinical note successfully', async () => {
      prisma.pet.findUnique.mockResolvedValue({ id: 'pet-1' });
      prisma.veterinario.findUnique.mockResolvedValue(vetFixture);
      prisma.notaClinica.create.mockResolvedValue(notaFixture);

      const result = await service.create('pet-1', 'vet-1', {
        diagnostico: 'Otite externa',
        prescricao: 'Antibiotico topico',
      });

      expect(result.id).toBe('nota-1');
      expect(result.veterinario_nome).toBe('Dr. Carlos');
      expect(result.veterinario_crmv).toBe('CRMV-CE-12345');
      expect(result.diagnostico).toBe('Otite externa');
    });

    it('should throw NotFoundException when pet does not exist', async () => {
      prisma.pet.findUnique.mockResolvedValue(null);

      await expect(
        service.create('missing-pet', 'vet-1', {
          diagnostico: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when veterinario does not exist', async () => {
      prisma.pet.findUnique.mockResolvedValue({ id: 'pet-1' });
      prisma.veterinario.findUnique.mockResolvedValue(null);

      await expect(
        service.create('pet-1', 'missing-vet', {
          diagnostico: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAllForPet', () => {
    it('should return all clinical notes for a pet', async () => {
      prisma.pet.findUnique.mockResolvedValue({ id: 'pet-1' });
      prisma.notaClinica.findMany.mockResolvedValue([notaFixture]);

      const result = await service.findAllForPet('pet-1');

      expect(result).toHaveLength(1);
      expect(result[0].diagnostico).toBe('Otite externa');
    });

    it('should throw NotFoundException when pet does not exist', async () => {
      prisma.pet.findUnique.mockResolvedValue(null);

      await expect(service.findAllForPet('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findOne', () => {
    it('should return a clinical note by id', async () => {
      prisma.notaClinica.findUnique.mockResolvedValue(notaFixture);

      const result = await service.findOne('nota-1');

      expect(result.id).toBe('nota-1');
    });

    it('should throw NotFoundException when note does not exist', async () => {
      prisma.notaClinica.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should delete a note when the author is the veterinario', async () => {
      prisma.notaClinica.findUnique.mockResolvedValue({
        ...notaFixture,
        veterinarioId: 'vet-1',
      });
      prisma.notaClinica.delete.mockResolvedValue(notaFixture);

      await service.remove('nota-1', 'vet-1');

      expect(prisma.notaClinica.delete).toHaveBeenCalledWith({
        where: { id: 'nota-1' },
      });
    });

    it('should throw ForbiddenException when another vet tries to delete', async () => {
      prisma.notaClinica.findUnique.mockResolvedValue({
        ...notaFixture,
        veterinarioId: 'vet-1',
      });

      await expect(service.remove('nota-1', 'vet-2')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException when note does not exist', async () => {
      prisma.notaClinica.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing', 'vet-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
