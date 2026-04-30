/* eslint-disable @typescript-eslint/no-unsafe-member-access */
jest.mock('jwks-rsa', () => ({
  passportJwtSecret:
    () =>
    (
      _req: unknown,
      _token: unknown,
      done: (err: Error | null, key: string) => void,
    ) =>
      done(null, 'test-secret'),
}));

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { QrCodePublisher } from '../src/modules/queue/qr-code.publisher';
import { PrismaService } from '../src/prisma/prisma.service';

type Ctx = {
  sub: string;
  email: string;
  permissions: string[];
};

const tutorCtx: Ctx = {
  sub: 'auth0|tutor-1',
  email: 'tutor@petcard.com',
  permissions: ['TUTOR'],
};
const vetCtx: Ctx = {
  sub: 'auth0|vet-1',
  email: 'vet@petcard.com',
  permissions: ['VET'],
};

let currentUser: Ctx = tutorCtx;

const mockPrisma = {
  tutor: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
  },
  pet: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  vaccineRecord: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  dewormingRecord: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  medicationRecord: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};

const tutor1 = {
  id: '22222222-2222-4222-8222-222222222222',
  auth0Id: 'auth0|tutor-1',
  name: 'Alice',
  email: 'tutor@petcard.com',
  phone: null,
  profileImageUrl: null,
  role: 'TUTOR',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const vet1 = {
  id: '33333333-3333-4333-8333-333333333333',
  auth0Id: 'auth0|vet-1',
  name: 'Vet Camila',
  email: 'vet@petcard.com',
  phone: null,
  profileImageUrl: null,
  role: 'VET',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const pet1 = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Rex',
  species: 'DOG',
  breed: 'Labrador',
  sex: 'MALE',
  birthDate: new Date('2023-05-01'),
  weight: 20,
  photoUrl: null,
  tutorId: '22222222-2222-4222-8222-222222222222',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const vaccine1 = {
  id: 'vac-uuid-1',
  petId: '11111111-1111-4111-8111-111111111111',
  vaccineName: 'Rabies',
  appliedAt: new Date('2026-01-10'),
  nextDoseAt: null,
  veterinarianName: null,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const deworming1 = {
  id: 'dew-uuid-1',
  petId: '11111111-1111-4111-8111-111111111111',
  productName: 'Drontal',
  appliedAt: new Date('2026-02-01'),
  nextDoseAt: null,
  veterinarianName: null,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const medication1 = {
  id: 'med-uuid-1',
  petId: '11111111-1111-4111-8111-111111111111',
  medicationName: 'Amoxicillin',
  dosage: '500mg',
  frequency: '8h',
  startDate: new Date('2026-03-01'),
  endDate: null,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('CRUDs MVP1 (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(QrCodePublisher)
      .useValue({ publishGenerate: jest.fn().mockResolvedValue(undefined) })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { user: Ctx } };
        }) => {
          const req = context.switchToHttp().getRequest();
          req.user = currentUser;
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = tutorCtx;
    mockPrisma.tutor.findUnique.mockImplementation(
      ({ where }: { where: { auth0Id?: string; id?: string } }) => {
        if (where.auth0Id === 'auth0|tutor-1' || where.id === tutor1.id) {
          return Promise.resolve(tutor1);
        }
        if (where.auth0Id === 'auth0|vet-1' || where.id === vet1.id) {
          return Promise.resolve(vet1);
        }
        return Promise.resolve(null);
      },
    );
  });

  // ============ TUTOR ============
  describe('Tutor', () => {
    it('GET /tutors/me returns the authenticated tutor', async () => {
      await request(app.getHttpServer())
        .get('/tutors/me')
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe('22222222-2222-4222-8222-222222222222');
          expect(res.body.email).toBe('tutor@petcard.com');
        });
    });

    it('PATCH /tutors/me updates the authenticated tutor', async () => {
      mockPrisma.tutor.update.mockResolvedValue({ ...tutor1, name: 'Alice B' });

      await request(app.getHttpServer())
        .patch('/tutors/me')
        .send({ name: 'Alice B' })
        .expect(200)
        .expect((res) => expect(res.body.name).toBe('Alice B'));

      expect(mockPrisma.tutor.update).toHaveBeenCalledWith({
        where: { auth0Id: 'auth0|tutor-1' },
        data: { name: 'Alice B' },
      });
    });

    it('PATCH /tutors/me rejects invalid payload', async () => {
      await request(app.getHttpServer())
        .patch('/tutors/me')
        .send({ email: 'not-an-email' })
        .expect(400);
    });

    it('GET /tutors/:id requires VET role', async () => {
      currentUser = tutorCtx;
      await request(app.getHttpServer())
        .get('/tutors/22222222-2222-4222-8222-222222222222')
        .expect(403);
    });

    it('GET /tutors/:id returns tutor for VET', async () => {
      currentUser = vetCtx;
      await request(app.getHttpServer())
        .get('/tutors/22222222-2222-4222-8222-222222222222')
        .expect(200)
        .expect((res) =>
          expect(res.body.id).toBe('22222222-2222-4222-8222-222222222222'),
        );
    });
  });

  // ============ PET ============
  describe('Pet', () => {
    it('POST /pets creates a pet for the tutor', async () => {
      mockPrisma.pet.create.mockResolvedValue(pet1);
      mockPrisma.pet.findUniqueOrThrow.mockResolvedValue({
        ...pet1,
        carteiraDigital: null,
      });

      await request(app.getHttpServer())
        .post('/pets')
        .send({
          name: 'Rex',
          species: 'DOG',
          sex: 'MALE',
          breed: 'Labrador',
          weight: 20,
          birth_date: '2023-05-01',
        })
        .expect(201)
        .expect((res) =>
          expect(res.body.id).toBe('11111111-1111-4111-8111-111111111111'),
        );

      expect(mockPrisma.pet.create).toHaveBeenCalled();
      const arg = mockPrisma.pet.create.mock.calls[0][0] as {
        data: { tutorId: string };
      };
      expect(arg.data.tutorId).toBe('22222222-2222-4222-8222-222222222222');
    });

    it('POST /pets rejects missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/pets')
        .send({ name: 'Rex' })
        .expect(400);
    });

    it('GET /pets lists tutor pets', async () => {
      mockPrisma.pet.findMany.mockResolvedValue([pet1]);

      await request(app.getHttpServer())
        .get('/pets')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveLength(1);
          expect(res.body[0].id).toBe('11111111-1111-4111-8111-111111111111');
        });

      expect(mockPrisma.pet.findMany).toHaveBeenCalledWith({
        where: { tutorId: '22222222-2222-4222-8222-222222222222' },
        include: { carteiraDigital: true },
      });
    });

    it('GET /pets/:id returns the pet for the owner', async () => {
      mockPrisma.pet.findUnique.mockResolvedValue(pet1);

      await request(app.getHttpServer())
        .get('/pets/11111111-1111-4111-8111-111111111111')
        .expect(200)
        .expect((res) =>
          expect(res.body.id).toBe('11111111-1111-4111-8111-111111111111'),
        );
    });

    it('GET /pets/:id forbids non-owner tutor', async () => {
      mockPrisma.pet.findUnique.mockResolvedValue({
        ...pet1,
        tutorId: 'other-tutor',
      });

      await request(app.getHttpServer())
        .get('/pets/11111111-1111-4111-8111-111111111111')
        .expect(403);
    });

    it('GET /pets/:id allows VET access', async () => {
      currentUser = vetCtx;
      mockPrisma.pet.findUnique.mockResolvedValue({
        ...pet1,
        tutorId: 'other-tutor',
      });

      await request(app.getHttpServer())
        .get('/pets/11111111-1111-4111-8111-111111111111')
        .expect(200);
    });

    it('PATCH /pets/:id updates an owned pet', async () => {
      mockPrisma.pet.findUnique.mockResolvedValue(pet1);
      mockPrisma.pet.update.mockResolvedValue({ ...pet1, name: 'Rex II' });

      await request(app.getHttpServer())
        .patch('/pets/11111111-1111-4111-8111-111111111111')
        .send({ name: 'Rex II' })
        .expect(200)
        .expect((res) => expect(res.body.name).toBe('Rex II'));
    });

    it('DELETE /pets/:id deletes an owned pet', async () => {
      mockPrisma.pet.findUnique.mockResolvedValue(pet1);
      mockPrisma.pet.delete.mockResolvedValue(pet1);

      await request(app.getHttpServer())
        .delete('/pets/11111111-1111-4111-8111-111111111111')
        .expect(204);
    });
  });

  // ============ VACCINE ============
  describe('Vaccine', () => {
    beforeEach(() => {
      mockPrisma.pet.findUnique.mockResolvedValue(pet1);
    });

    it('POST /pets/:petId/vaccines creates a record', async () => {
      mockPrisma.vaccineRecord.create.mockResolvedValue(vaccine1);

      await request(app.getHttpServer())
        .post('/pets/11111111-1111-4111-8111-111111111111/vaccines')
        .send({
          pet_id: '11111111-1111-4111-8111-111111111111',
          vaccine_name: 'Rabies',
          applied_at: '2026-01-10',
        })
        .expect(201)
        .expect((res) => expect(res.body.id).toBe('vac-uuid-1'));
    });

    it('GET /pets/:petId/vaccines lists records', async () => {
      mockPrisma.vaccineRecord.findMany.mockResolvedValue([vaccine1]);

      await request(app.getHttpServer())
        .get('/pets/11111111-1111-4111-8111-111111111111/vaccines')
        .expect(200)
        .expect((res) => expect(res.body).toHaveLength(1));
    });

    it('PATCH /vaccines/:id updates the record', async () => {
      mockPrisma.vaccineRecord.findUnique.mockResolvedValue(vaccine1);
      mockPrisma.vaccineRecord.update.mockResolvedValue({
        ...vaccine1,
        vaccineName: 'Rabies Plus',
      });

      await request(app.getHttpServer())
        .patch('/vaccines/vac-uuid-1')
        .send({ vaccine_name: 'Rabies Plus' })
        .expect(200)
        .expect((res) => expect(res.body.vaccine_name).toBe('Rabies Plus'));
    });

    it('DELETE /vaccines/:id removes the record', async () => {
      mockPrisma.vaccineRecord.findUnique.mockResolvedValue(vaccine1);
      mockPrisma.vaccineRecord.delete.mockResolvedValue(vaccine1);

      await request(app.getHttpServer())
        .delete('/vaccines/vac-uuid-1')
        .expect(204);
    });
  });

  // ============ DEWORMING ============
  describe('Deworming', () => {
    beforeEach(() => {
      mockPrisma.pet.findUnique.mockResolvedValue(pet1);
    });

    it('POST /pets/:petId/dewormings creates a record', async () => {
      mockPrisma.dewormingRecord.create.mockResolvedValue(deworming1);

      await request(app.getHttpServer())
        .post('/pets/11111111-1111-4111-8111-111111111111/dewormings')
        .send({
          pet_id: '11111111-1111-4111-8111-111111111111',
          product_name: 'Drontal',
          applied_at: '2026-02-01',
        })
        .expect(201)
        .expect((res) => expect(res.body.id).toBe('dew-uuid-1'));
    });

    it('GET /pets/:petId/dewormings lists records', async () => {
      mockPrisma.dewormingRecord.findMany.mockResolvedValue([deworming1]);

      await request(app.getHttpServer())
        .get('/pets/11111111-1111-4111-8111-111111111111/dewormings')
        .expect(200)
        .expect((res) => expect(res.body).toHaveLength(1));
    });

    it('PATCH /dewormings/:id updates the record', async () => {
      mockPrisma.dewormingRecord.findUnique.mockResolvedValue(deworming1);
      mockPrisma.dewormingRecord.update.mockResolvedValue({
        ...deworming1,
        productName: 'Drontal Plus',
      });

      await request(app.getHttpServer())
        .patch('/dewormings/dew-uuid-1')
        .send({ product_name: 'Drontal Plus' })
        .expect(200);
    });

    it('DELETE /dewormings/:id removes the record', async () => {
      mockPrisma.dewormingRecord.findUnique.mockResolvedValue(deworming1);
      mockPrisma.dewormingRecord.delete.mockResolvedValue(deworming1);

      await request(app.getHttpServer())
        .delete('/dewormings/dew-uuid-1')
        .expect(204);
    });
  });

  // ============ MEDICATION ============
  describe('Medication', () => {
    beforeEach(() => {
      mockPrisma.pet.findUnique.mockResolvedValue(pet1);
    });

    it('POST /pets/:petId/medications creates a record', async () => {
      mockPrisma.medicationRecord.create.mockResolvedValue(medication1);

      await request(app.getHttpServer())
        .post('/pets/11111111-1111-4111-8111-111111111111/medications')
        .send({
          pet_id: '11111111-1111-4111-8111-111111111111',
          medication_name: 'Amoxicillin',
          dosage: '500mg',
          frequency: '8h',
          start_date: '2026-03-01',
        })
        .expect(201)
        .expect((res) => expect(res.body.id).toBe('med-uuid-1'));
    });

    it('GET /pets/:petId/medications lists records', async () => {
      mockPrisma.medicationRecord.findMany.mockResolvedValue([medication1]);

      await request(app.getHttpServer())
        .get('/pets/11111111-1111-4111-8111-111111111111/medications')
        .expect(200)
        .expect((res) => expect(res.body).toHaveLength(1));
    });

    it('PATCH /medications/:id updates the record', async () => {
      mockPrisma.medicationRecord.findUnique.mockResolvedValue(medication1);
      mockPrisma.medicationRecord.update.mockResolvedValue({
        ...medication1,
        dosage: '250mg',
      });

      await request(app.getHttpServer())
        .patch('/medications/med-uuid-1')
        .send({ dosage: '250mg' })
        .expect(200);
    });

    it('DELETE /medications/:id removes the record', async () => {
      mockPrisma.medicationRecord.findUnique.mockResolvedValue(medication1);
      mockPrisma.medicationRecord.delete.mockResolvedValue(medication1);

      await request(app.getHttpServer())
        .delete('/medications/med-uuid-1')
        .expect(204);
    });
  });
});
