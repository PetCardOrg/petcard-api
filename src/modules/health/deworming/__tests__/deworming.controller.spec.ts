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
import { DewormingController } from '../deworming.controller';
import { DewormingService } from '../deworming.service';

describe('DewormingController (integração)', () => {
  let harness: ControllerHarness;
  let prisma: {
    pet: { findUnique: jest.Mock };
    dewormingRecord: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  const pet = { id: 'pet-1', tutorId: 'tutor-1' };
  const record = {
    id: 'dew-1',
    petId: 'pet-1',
    productName: 'Drontal',
    appliedAt: new Date('2026-02-01'),
    nextDoseAt: null,
    veterinarianName: null,
    notes: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeAll(async () => {
    prisma = {
      pet: { findUnique: jest.fn() },
      dewormingRecord: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    comTransacao(prisma);

    harness = await createControllerTestApp({
      controllers: [DewormingController],
      providers: [
        acaoClinicaProvider().provider,
        DewormingService,
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
    prisma.dewormingRecord.create.mockResolvedValue(record);

    const res = await request(harness.app.getHttpServer())
      .post('/pets/pet-1/dewormings')
      .send({
        pet_id: '11111111-1111-4111-8111-111111111111',
        product_name: 'Drontal',
        applied_at: '2026-02-01',
      })
      .expect(201);

    expect(res.body.id).toBe('dew-1');
    expect(res.body.product_name).toBe('Drontal');
  });

  it('POST permite VET registrar em qualquer pet (201)', async () => {
    harness.setUser(VET);
    prisma.pet.findUnique.mockResolvedValue({ ...pet, tutorId: 'outro' });
    prisma.dewormingRecord.create.mockResolvedValue(record);

    await request(harness.app.getHttpServer())
      .post('/pets/pet-1/dewormings')
      .send({
        pet_id: '11111111-1111-4111-8111-111111111111',
        product_name: 'Drontal',
        applied_at: '2026-02-01',
      })
      .expect(201);
  });

  it('POST rejeita payload inválido (400)', async () => {
    await request(harness.app.getHttpServer())
      .post('/pets/pet-1/dewormings')
      .send({})
      .expect(400);

    expect(prisma.dewormingRecord.create).not.toHaveBeenCalled();
  });

  it('GET lista os registros do pet (200)', async () => {
    prisma.dewormingRecord.findMany.mockResolvedValue([record]);

    const res = await request(harness.app.getHttpServer())
      .get('/pets/pet-1/dewormings')
      .expect(200);

    expect(res.body).toHaveLength(1);
  });

  it('PATCH atualiza o registro (200)', async () => {
    prisma.dewormingRecord.findFirst.mockResolvedValue(record);
    prisma.dewormingRecord.update.mockResolvedValue({
      ...record,
      productName: 'Drontal Plus',
    });

    const res = await request(harness.app.getHttpServer())
      .patch('/dewormings/dew-1')
      .send({ product_name: 'Drontal Plus' })
      .expect(200);

    expect(res.body.product_name).toBe('Drontal Plus');
  });

  it('DELETE remove o registro do dono (204)', async () => {
    prisma.dewormingRecord.findFirst.mockResolvedValue(record);
    prisma.dewormingRecord.delete.mockResolvedValue(record);

    await request(harness.app.getHttpServer())
      .delete('/dewormings/dew-1')
      .expect(204);
  });

  it('DELETE é proibido para VET (403)', async () => {
    harness.setUser(VET);

    await request(harness.app.getHttpServer())
      .delete('/dewormings/dew-1')
      .expect(403);
  });
});
