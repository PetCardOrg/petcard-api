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

import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
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

let currentUser: Ctx | null = tutorCtx;

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

const sampleRow = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Pet Clínica Aldeota',
  address: 'Av. Dom Luís, 1200 - Aldeota, Fortaleza/CE',
  phone: '(85) 91111-1001',
  specialty: 'Clínica geral',
  coordinates: { type: 'Point', coordinates: [-38.5099, -3.7358] },
  distance_meters: 1234,
  created_at: new Date('2026-05-01T12:00:00Z'),
  updated_at: new Date('2026-05-01T12:00:00Z'),
};

const mockPrisma = {
  tutor: {
    findUnique: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};

describe('Clinica Geo (e2e)', () => {
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
          switchToHttp: () => { getRequest: () => { user: Ctx | null } };
        }) => {
          if (!currentUser) {
            throw new UnauthorizedException();
          }
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
    mockPrisma.tutor.findUnique.mockResolvedValue(tutor1);
    mockPrisma.$queryRaw.mockResolvedValue([sampleRow]);
  });

  it('returns 401 when no token is provided', async () => {
    currentUser = null;
    await request(app.getHttpServer())
      .get('/clinicas')
      .query({ lat: -3.7302, lng: -38.5217, radiusKm: 10 })
      .expect(401);
  });

  it('returns clinics for an authenticated tutor', async () => {
    await request(app.getHttpServer())
      .get('/clinicas')
      .query({ lat: -3.7302, lng: -38.5217, radiusKm: 10 })
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body[0]).toMatchObject({
          id: sampleRow.id,
          name: sampleRow.name,
          address: sampleRow.address,
          phone: sampleRow.phone,
          specialty: sampleRow.specialty,
          distance_meters: sampleRow.distance_meters,
        });
        expect(res.body[0].coordinates).toEqual({
          type: 'Point',
          coordinates: [-38.5099, -3.7358],
        });
      });
  });

  it('rejects radiusKm below 0.1', async () => {
    await request(app.getHttpServer())
      .get('/clinicas')
      .query({ lat: -3.7302, lng: -38.5217, radiusKm: 0.05 })
      .expect(400);
  });

  it('rejects radiusKm above 50', async () => {
    await request(app.getHttpServer())
      .get('/clinicas')
      .query({ lat: -3.7302, lng: -38.5217, radiusKm: 51 })
      .expect(400);
  });

  it('rejects requests without lat', async () => {
    await request(app.getHttpServer())
      .get('/clinicas')
      .query({ lng: -38.5217, radiusKm: 10 })
      .expect(400);
  });

  it('rejects requests without lng', async () => {
    await request(app.getHttpServer())
      .get('/clinicas')
      .query({ lat: -3.7302, radiusKm: 10 })
      .expect(400);
  });

  it('rejects invalid latitude values', async () => {
    await request(app.getHttpServer())
      .get('/clinicas')
      .query({ lat: 999, lng: -38.5217, radiusKm: 10 })
      .expect(400);
  });

  it('rejects limit above 50', async () => {
    await request(app.getHttpServer())
      .get('/clinicas')
      .query({ lat: -3.7302, lng: -38.5217, radiusKm: 10, limit: 51 })
      .expect(400);
  });

  it('returns empty array when no clinics match', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    await request(app.getHttpServer())
      .get('/clinicas')
      .query({ lat: -3.7302, lng: -38.5217, radiusKm: 1 })
      .expect(200)
      .expect((res) => expect(res.body).toEqual([]));
  });

  it('accepts specialty as optional filter', async () => {
    await request(app.getHttpServer())
      .get('/clinicas')
      .query({
        lat: -3.7302,
        lng: -38.5217,
        radiusKm: 10,
        specialty: 'Clínica geral',
      })
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
      });
  });

  it('returns 200 with distance filter only (no specialty)', async () => {
    await request(app.getHttpServer())
      .get('/clinicas')
      .query({ lat: -3.7302, lng: -38.5217, radiusKm: 5 })
      .expect(200);
  });

  it('rejects empty specialty string', async () => {
    await request(app.getHttpServer())
      .get('/clinicas')
      .query({
        lat: -3.7302,
        lng: -38.5217,
        radiusKm: 10,
        specialty: '',
      })
      .expect(400);
  });
});
