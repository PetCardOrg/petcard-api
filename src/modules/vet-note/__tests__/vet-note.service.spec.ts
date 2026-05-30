import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationKind } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationService } from '../../notification/notification.service';
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
  let notificationService: { schedulePush: jest.Mock };

  const petFixture = {
    id: 'pet-1',
    name: 'Rex',
    tutorId: 'tutor-1',
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
    notificationService = {
      schedulePush: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VetNoteService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationService, useValue: notificationService },
      ],
    }).compile();

    service = module.get<VetNoteService>(VetNoteService);
  });

  describe('create', () => {
    it('should create a clinical note successfully', async () => {
      prisma.pet.findUnique.mockResolvedValue(petFixture);
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

    it('should schedule push notification after creating note', async () => {
      prisma.pet.findUnique.mockResolvedValue(petFixture);
      prisma.veterinario.findUnique.mockResolvedValue(vetFixture);
      prisma.notaClinica.create.mockResolvedValue(notaFixture);

      await service.create('pet-1', 'vet-1', {
        diagnostico: 'Otite externa',
      });

      expect(notificationService.schedulePush).toHaveBeenCalledWith({
        tutorId: 'tutor-1',
        kind: NotificationKind.CLINICAL_NOTE,
        referenceType: 'CLINICAL_NOTE',
        referenceId: 'nota-1',
        title: 'Nova nota clínica',
        body: 'Dr. Carlos adicionou uma nota clínica para Rex',
        data: {
          pet_id: 'pet-1',
          clinical_note_id: 'nota-1',
          type: 'clinical_note',
        },
      });
    });

    it('should use correct tutor as notification recipient', async () => {
      const otherPet = { id: 'pet-2', name: 'Luna', tutorId: 'tutor-99' };
      prisma.pet.findUnique.mockResolvedValue(otherPet);
      prisma.veterinario.findUnique.mockResolvedValue(vetFixture);
      prisma.notaClinica.create.mockResolvedValue({
        ...notaFixture,
        id: 'nota-2',
        petId: 'pet-2',
      });

      await service.create('pet-2', 'vet-1', {
        diagnostico: 'Check-up',
      });

      expect(notificationService.schedulePush).toHaveBeenCalledWith(
        expect.objectContaining({
          tutorId: 'tutor-99',
          body: 'Dr. Carlos adicionou uma nota clínica para Luna',
        }),
      );
    });

    it('should include pet name and vet name in push message', async () => {
      const customPet = { id: 'pet-3', name: 'Thor', tutorId: 'tutor-1' };
      const customVet = {
        id: 'vet-2',
        nome: 'Dra. Camila',
        crmv: 'CRMV-SP-999',
      };
      prisma.pet.findUnique.mockResolvedValue(customPet);
      prisma.veterinario.findUnique.mockResolvedValue(customVet);
      prisma.notaClinica.create.mockResolvedValue({
        ...notaFixture,
        id: 'nota-3',
        petId: 'pet-3',
        veterinarioId: 'vet-2',
        veterinario: { nome: 'Dra. Camila', crmv: 'CRMV-SP-999' },
      });

      await service.create('pet-3', 'vet-2', {
        diagnostico: 'Vacinação',
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const body = notificationService.schedulePush.mock.calls[0][0]
        .body as string;
      expect(body).toContain('Thor');
      expect(body).toContain('Dra. Camila');
    });

    it('should not break note creation when push notification fails', async () => {
      prisma.pet.findUnique.mockResolvedValue(petFixture);
      prisma.veterinario.findUnique.mockResolvedValue(vetFixture);
      prisma.notaClinica.create.mockResolvedValue(notaFixture);
      notificationService.schedulePush.mockRejectedValue(
        new Error('RabbitMQ connection lost'),
      );
      jest.spyOn(service['logger'], 'error').mockImplementation(() => {});

      const result = await service.create('pet-1', 'vet-1', {
        diagnostico: 'Otite externa',
      });

      expect(result.id).toBe('nota-1');
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
      prisma.pet.findUnique.mockResolvedValue(petFixture);
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
      prisma.pet.findUnique.mockResolvedValue(petFixture);
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
