/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import request from 'supertest';
import {
  createControllerTestApp,
  ControllerHarness,
  TUTOR,
  VET,
} from '../../../../test/utils/controller-harness';
import { PrismaService } from '../../../prisma/prisma.service';
import { QrCodePublisher } from '../../queue/qr-code.publisher';
import { TutorService } from '../../tutor/tutor.service';
import { PetController } from '../pet.controller';
import { PetService } from '../pet.service';

describe('PetController (integração)', () => {
  let harness: ControllerHarness;
  let prisma: {
    tutor: { findUnique: jest.Mock };
    pet: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    petAtendido: { findUnique: jest.Mock };
  };
  let qrPublisher: { publishGenerate: jest.Mock };

  const tutor = {
    id: 'tutor-1',
    name: 'Alice',
    email: 'tutor@petcard.com',
  };
  const pet = {
    id: 'pet-1',
    name: 'Rex',
    species: 'DOG',
    breed: 'Labrador',
    sex: 'MALE',
    birthDate: new Date('2023-05-01'),
    weight: 20,
    photoUrl: null,
    tutorId: 'tutor-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    carteiraDigital: null,
  };

  beforeAll(async () => {
    prisma = {
      tutor: { findUnique: jest.fn() },
      pet: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      petAtendido: { findUnique: jest.fn() },
    };
    qrPublisher = { publishGenerate: jest.fn().mockResolvedValue(undefined) };

    harness = await createControllerTestApp({
      controllers: [PetController],
      providers: [
        PetService,
        TutorService,
        { provide: PrismaService, useValue: prisma },
        { provide: QrCodePublisher, useValue: qrPublisher },
      ],
    });
  });

  afterAll(async () => {
    await harness.app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    harness.setUser(TUTOR);
    prisma.tutor.findUnique.mockResolvedValue(tutor);
  });

  describe('POST /pets', () => {
    it('cria o pet do tutor autenticado (201)', async () => {
      prisma.pet.create.mockResolvedValue(pet);
      prisma.pet.findUniqueOrThrow.mockResolvedValue(pet);

      const res = await request(harness.app.getHttpServer())
        .post('/pets')
        .send({
          name: 'Rex',
          species: 'DOG',
          sex: 'MALE',
          breed: 'Labrador',
          weight: 20,
          birth_date: '2023-05-01',
        })
        .expect(201);

      expect(res.body.id).toBe('pet-1');
      expect(res.body.tutor_id).toBe('tutor-1');
      const createArg = prisma.pet.create.mock.calls[0][0];
      expect(createArg.data.tutorId).toBe('tutor-1');
      expect(qrPublisher.publishGenerate).toHaveBeenCalledWith('pet-1');
    });

    it('rejeita payload sem campos obrigatórios (400)', async () => {
      await request(harness.app.getHttpServer())
        .post('/pets')
        .send({ name: 'Rex' })
        .expect(400);

      expect(prisma.pet.create).not.toHaveBeenCalled();
    });

    it('rejeita propriedade não esperada (400)', async () => {
      await request(harness.app.getHttpServer())
        .post('/pets')
        .send({ name: 'Rex', species: 'DOG', sex: 'MALE', hacker: true })
        .expect(400);
    });

    it('proíbe VET de criar pet (403)', async () => {
      harness.setUser(VET);

      await request(harness.app.getHttpServer())
        .post('/pets')
        .send({ name: 'Rex', species: 'DOG', sex: 'MALE' })
        .expect(403);
    });

    it('exige autenticação (401)', async () => {
      harness.setUser(null);

      await request(harness.app.getHttpServer())
        .post('/pets')
        .send({ name: 'Rex', species: 'DOG', sex: 'MALE' })
        .expect(401);
    });
  });

  describe('GET /pets', () => {
    it('lista os pets do tutor (200)', async () => {
      prisma.pet.findMany.mockResolvedValue([pet]);

      const res = await request(harness.app.getHttpServer())
        .get('/pets')
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('pet-1');
      expect(prisma.pet.findMany).toHaveBeenCalledWith({
        where: { tutorId: 'tutor-1' },
        include: { carteiraDigital: true },
      });
    });
  });

  describe('GET /pets/:id', () => {
    it('retorna o pet do dono (200)', async () => {
      prisma.pet.findUnique.mockResolvedValue(pet);

      const res = await request(harness.app.getHttpServer())
        .get('/pets/pet-1')
        .expect(200);

      expect(res.body.id).toBe('pet-1');
    });

    it('proíbe tutor que não é dono (403)', async () => {
      prisma.pet.findUnique.mockResolvedValue({ ...pet, tutorId: 'outro' });

      await request(harness.app.getHttpServer()).get('/pets/pet-1').expect(403);
    });

    it('permite acesso do VET que atende o pet (200)', async () => {
      harness.setUser(VET);
      prisma.pet.findUnique.mockResolvedValue({ ...pet, tutorId: 'outro' });
      prisma.petAtendido.findUnique.mockResolvedValue({ id: 'vinculo-1' });

      await request(harness.app.getHttpServer()).get('/pets/pet-1').expect(200);
    });

    it('barra o VET que não atende o pet (403)', async () => {
      harness.setUser(VET);
      prisma.pet.findUnique.mockResolvedValue({ ...pet, tutorId: 'outro' });
      prisma.petAtendido.findUnique.mockResolvedValue(null);

      await request(harness.app.getHttpServer()).get('/pets/pet-1').expect(403);
    });

    it('retorna 404 quando o pet não existe', async () => {
      prisma.pet.findUnique.mockResolvedValue(null);

      await request(harness.app.getHttpServer())
        .get('/pets/missing')
        .expect(404);
    });
  });

  describe('PATCH /pets/:id', () => {
    it('atualiza o pet do dono (200)', async () => {
      prisma.pet.findUnique.mockResolvedValue(pet);
      prisma.pet.update.mockResolvedValue({ ...pet, name: 'Rex II' });

      const res = await request(harness.app.getHttpServer())
        .patch('/pets/pet-1')
        .send({ name: 'Rex II' })
        .expect(200);

      expect(res.body.name).toBe('Rex II');
    });
  });

  describe('DELETE /pets/:id', () => {
    it('remove o pet do dono (204)', async () => {
      prisma.pet.findUnique.mockResolvedValue(pet);
      prisma.pet.delete.mockResolvedValue(pet);

      await request(harness.app.getHttpServer())
        .delete('/pets/pet-1')
        .expect(204);

      expect(prisma.pet.delete).toHaveBeenCalledWith({
        where: { id: 'pet-1' },
      });
    });
  });

  describe('POST /pets/:id/qr-code', () => {
    it('reenfileira a geração de QR Code do dono (202)', async () => {
      prisma.pet.findUnique.mockResolvedValue(pet);

      await request(harness.app.getHttpServer())
        .post('/pets/pet-1/qr-code')
        .expect(202);

      expect(qrPublisher.publishGenerate).toHaveBeenCalledWith('pet-1');
    });
  });
});
