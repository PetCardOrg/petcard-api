/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import request from 'supertest';
import {
  acaoClinicaProvider,
  comTransacao,
} from '../../../../../test/utils/acao-clinica';
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
import { VaccineController } from '../vaccine.controller';
import { VaccineService } from '../vaccine.service';

describe('VaccineController (integração)', () => {
  let harness: ControllerHarness;
  let prisma: {
    pet: { findUnique: jest.Mock };
    vaccineRecord: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  const pet = { id: 'pet-1', tutorId: 'tutor-1' };
  const record = {
    id: 'vac-1',
    petId: 'pet-1',
    vaccineName: 'Raiva',
    appliedAt: new Date('2026-01-10'),
    nextDoseAt: null,
    veterinarianName: null,
    notes: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeAll(async () => {
    prisma = {
      pet: { findUnique: jest.fn() },
      vaccineRecord: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    comTransacao(prisma);

    harness = await createControllerTestApp({
      controllers: [VaccineController],
      providers: [
        acaoClinicaProvider().provider,
        VaccineService,
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

  it('POST cria registro para o dono (201)', async () => {
    prisma.vaccineRecord.create.mockResolvedValue(record);

    const res = await request(harness.app.getHttpServer())
      .post('/pets/pet-1/vaccines')
      .send({
        pet_id: '11111111-1111-4111-8111-111111111111',
        vaccine_name: 'Raiva',
        applied_at: '2026-01-10',
      })
      .expect(201);

    expect(res.body.id).toBe('vac-1');
    expect(res.body.vaccine_name).toBe('Raiva');
  });

  it('POST permite VET registrar em qualquer pet (201)', async () => {
    harness.setUser(VET);
    prisma.pet.findUnique.mockResolvedValue({ ...pet, tutorId: 'outro' });
    prisma.vaccineRecord.create.mockResolvedValue(record);

    await request(harness.app.getHttpServer())
      .post('/pets/pet-1/vaccines')
      .send({
        pet_id: '11111111-1111-4111-8111-111111111111',
        vaccine_name: 'Raiva',
        applied_at: '2026-01-10',
      })
      .expect(201);
  });

  it('POST rejeita payload inválido (400)', async () => {
    await request(harness.app.getHttpServer())
      .post('/pets/pet-1/vaccines')
      .send({})
      .expect(400);

    expect(prisma.vaccineRecord.create).not.toHaveBeenCalled();
  });

  it('GET lista os registros do pet (200)', async () => {
    prisma.vaccineRecord.findMany.mockResolvedValue([record]);

    const res = await request(harness.app.getHttpServer())
      .get('/pets/pet-1/vaccines')
      .expect(200);

    expect(res.body).toHaveLength(1);
  });

  it('PATCH atualiza o registro (200)', async () => {
    prisma.vaccineRecord.findFirst.mockResolvedValue(record);
    prisma.vaccineRecord.update.mockResolvedValue({
      ...record,
      vaccineName: 'Raiva Plus',
    });

    const res = await request(harness.app.getHttpServer())
      .patch('/vaccines/vac-1')
      .send({ vaccine_name: 'Raiva Plus' })
      .expect(200);

    expect(res.body.vaccine_name).toBe('Raiva Plus');
  });

  it('DELETE remove o registro do dono (204)', async () => {
    prisma.vaccineRecord.findFirst.mockResolvedValue(record);
    prisma.vaccineRecord.delete.mockResolvedValue(record);

    await request(harness.app.getHttpServer())
      .delete('/vaccines/vac-1')
      .expect(204);
  });

  it('DELETE é proibido para VET (403)', async () => {
    harness.setUser(VET);

    await request(harness.app.getHttpServer())
      .delete('/vaccines/vac-1')
      .expect(403);
  });
});
