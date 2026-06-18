/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Logger } from '@nestjs/common';
import request from 'supertest';
import {
  createControllerTestApp,
  ControllerHarness,
  TUTOR,
  VET,
} from '../../../../test/utils/controller-harness';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationService } from '../../notification/notification.service';
import { VetNoteController } from '../vet-note.controller';
import { VetNoteService } from '../vet-note.service';

describe('VetNoteController (integração)', () => {
  let harness: ControllerHarness;
  let prisma: {
    pet: { findUnique: jest.Mock };
    veterinario: { findUnique: jest.Mock };
    notaClinica: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
  };
  let notifications: { schedulePush: jest.Mock };

  const pet = { id: 'pet-1', name: 'Rex', tutorId: 'tutor-1' };
  const nota = {
    id: 'nota-1',
    petId: 'pet-1',
    veterinarioId: 'vet-1',
    diagnostico: 'Otite',
    prescricao: null,
    observacoes: null,
    googlePlaceId: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    veterinario: { nome: 'Dra. Vet', crmv: 'CRMV-123' },
  };

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    prisma = {
      pet: { findUnique: jest.fn() },
      veterinario: { findUnique: jest.fn() },
      notaClinica: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
    };
    notifications = { schedulePush: jest.fn().mockResolvedValue(undefined) };

    harness = await createControllerTestApp({
      controllers: [VetNoteController],
      providers: [
        VetNoteService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationService, useValue: notifications },
      ],
    });
  });

  afterAll(async () => {
    await harness.app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    harness.setUser(VET);
    prisma.pet.findUnique.mockResolvedValue(pet);
    prisma.veterinario.findUnique.mockResolvedValue({ id: 'vet-1' });
  });

  describe('POST /pets/:petId/clinical-notes', () => {
    it('VET cria a nota e dispara o push (201)', async () => {
      prisma.notaClinica.create.mockResolvedValue(nota);

      const res = await request(harness.app.getHttpServer())
        .post('/pets/pet-1/clinical-notes')
        .send({ diagnostico: 'Otite', prescricao: 'Antibiótico' })
        .expect(201);

      expect(res.body.id).toBe('nota-1');
      expect(res.body.veterinario_nome).toBe('Dra. Vet');
      expect(notifications.schedulePush).toHaveBeenCalledTimes(1);
    });

    it('cria a nota mesmo se o push falhar (201, degradação)', async () => {
      prisma.notaClinica.create.mockResolvedValue(nota);
      notifications.schedulePush.mockRejectedValueOnce(new Error('FCM down'));

      await request(harness.app.getHttpServer())
        .post('/pets/pet-1/clinical-notes')
        .send({ diagnostico: 'Otite' })
        .expect(201);
    });

    it('proíbe TUTOR de criar nota (403)', async () => {
      harness.setUser(TUTOR);

      await request(harness.app.getHttpServer())
        .post('/pets/pet-1/clinical-notes')
        .send({ diagnostico: 'Otite' })
        .expect(403);
    });

    it('rejeita payload inválido (400)', async () => {
      await request(harness.app.getHttpServer())
        .post('/pets/pet-1/clinical-notes')
        .send({})
        .expect(400);

      expect(prisma.notaClinica.create).not.toHaveBeenCalled();
    });
  });

  describe('GET /pets/:petId/clinical-notes', () => {
    it('o dono do pet lista as notas (200)', async () => {
      harness.setUser(TUTOR);
      prisma.notaClinica.findMany.mockResolvedValue([nota]);

      const res = await request(harness.app.getHttpServer())
        .get('/pets/pet-1/clinical-notes')
        .expect(200);

      expect(res.body).toHaveLength(1);
    });

    it('proíbe tutor que não é dono (403)', async () => {
      harness.setUser(TUTOR);
      prisma.pet.findUnique.mockResolvedValue({ ...pet, tutorId: 'outro' });

      await request(harness.app.getHttpServer())
        .get('/pets/pet-1/clinical-notes')
        .expect(403);
    });
  });

  describe('GET /clinical-notes/:id', () => {
    it('retorna a nota para o dono do pet (200)', async () => {
      harness.setUser(TUTOR);
      prisma.notaClinica.findUnique.mockResolvedValue({
        ...nota,
        pet: { tutorId: 'tutor-1' },
      });

      const res = await request(harness.app.getHttpServer())
        .get('/clinical-notes/nota-1')
        .expect(200);

      expect(res.body.id).toBe('nota-1');
    });

    it('retorna 404 para nota inexistente', async () => {
      prisma.notaClinica.findUnique.mockResolvedValue(null);

      await request(harness.app.getHttpServer())
        .get('/clinical-notes/missing')
        .expect(404);
    });
  });

  describe('DELETE /clinical-notes/:id', () => {
    it('o autor (VET) remove a própria nota (204)', async () => {
      prisma.notaClinica.findUnique.mockResolvedValue(nota);
      prisma.notaClinica.delete.mockResolvedValue(nota);

      await request(harness.app.getHttpServer())
        .delete('/clinical-notes/nota-1')
        .expect(204);
    });

    it('proíbe VET de apagar nota de outro vet (403)', async () => {
      prisma.notaClinica.findUnique.mockResolvedValue({
        ...nota,
        veterinarioId: 'outro-vet',
      });

      await request(harness.app.getHttpServer())
        .delete('/clinical-notes/nota-1')
        .expect(403);

      expect(prisma.notaClinica.delete).not.toHaveBeenCalled();
    });

    it('proíbe TUTOR de apagar nota (403)', async () => {
      harness.setUser(TUTOR);

      await request(harness.app.getHttpServer())
        .delete('/clinical-notes/nota-1')
        .expect(403);
    });
  });
});
