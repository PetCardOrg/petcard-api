/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import request from 'supertest';
import {
  createControllerTestApp,
  ControllerHarness,
  TUTOR,
  VET,
} from '../../../../../test/utils/controller-harness';
import { PrismaService } from '../../../../prisma/prisma.service';
import { QrCodePublisher } from '../../../queue/qr-code.publisher';
import { PetService } from '../../../pet/pet.service';
import { TutorService } from '../../../tutor/tutor.service';
import { MedicationController } from '../medication.controller';
import { MedicationService } from '../medication.service';

describe('MedicationController (integração)', () => {
  let harness: ControllerHarness;
  let prisma: {
    pet: { findUnique: jest.Mock };
    medicationRecord: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  const pet = { id: 'pet-1', tutorId: 'tutor-1' };
  const record = {
    id: 'med-1',
    petId: 'pet-1',
    medicationName: 'Amoxicilina',
    dosage: '500mg',
    frequency: '8h',
    startDate: new Date('2026-03-01'),
    endDate: null,
    notes: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeAll(async () => {
    prisma = {
      pet: { findUnique: jest.fn() },
      medicationRecord: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    harness = await createControllerTestApp({
      controllers: [MedicationController],
      providers: [
        MedicationService,
        PetService,
        TutorService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: QrCodePublisher,
          useValue: { publishGenerate: jest.fn() },
        },
      ],
    });
  });

  afterAll(async () => {
    await harness.app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    harness.setUser(TUTOR);
    prisma.pet.findUnique.mockResolvedValue(pet);
  });

  const validBody = {
    pet_id: '11111111-1111-4111-8111-111111111111',
    medication_name: 'Amoxicilina',
    dosage: '500mg',
    frequency: '8h',
    start_date: '2026-03-01',
  };

  it('POST cria registro para o dono (201)', async () => {
    prisma.medicationRecord.create.mockResolvedValue(record);

    const res = await request(harness.app.getHttpServer())
      .post('/pets/pet-1/medications')
      .send(validBody)
      .expect(201);

    expect(res.body.id).toBe('med-1');
    expect(res.body.medication_name).toBe('Amoxicilina');
  });

  it('POST permite VET registrar em qualquer pet (201)', async () => {
    harness.setUser(VET);
    prisma.pet.findUnique.mockResolvedValue({ ...pet, tutorId: 'outro' });
    prisma.medicationRecord.create.mockResolvedValue(record);

    await request(harness.app.getHttpServer())
      .post('/pets/pet-1/medications')
      .send(validBody)
      .expect(201);
  });

  it('POST rejeita payload inválido (400)', async () => {
    await request(harness.app.getHttpServer())
      .post('/pets/pet-1/medications')
      .send({ medication_name: 'Amoxicilina' })
      .expect(400);

    expect(prisma.medicationRecord.create).not.toHaveBeenCalled();
  });

  it('GET lista os registros do pet (200)', async () => {
    prisma.medicationRecord.findMany.mockResolvedValue([record]);

    const res = await request(harness.app.getHttpServer())
      .get('/pets/pet-1/medications')
      .expect(200);

    expect(res.body).toHaveLength(1);
  });

  it('PATCH atualiza o registro (200)', async () => {
    prisma.medicationRecord.findUnique.mockResolvedValue(record);
    prisma.medicationRecord.update.mockResolvedValue({
      ...record,
      dosage: '250mg',
    });

    const res = await request(harness.app.getHttpServer())
      .patch('/medications/med-1')
      .send({ dosage: '250mg' })
      .expect(200);

    expect(res.body.dosage).toBe('250mg');
  });

  it('DELETE remove o registro do dono (204)', async () => {
    prisma.medicationRecord.findUnique.mockResolvedValue(record);
    prisma.medicationRecord.delete.mockResolvedValue(record);

    await request(harness.app.getHttpServer())
      .delete('/medications/med-1')
      .expect(204);
  });

  it('DELETE é proibido para VET (403)', async () => {
    harness.setUser(VET);

    await request(harness.app.getHttpServer())
      .delete('/medications/med-1')
      .expect(403);
  });
});
