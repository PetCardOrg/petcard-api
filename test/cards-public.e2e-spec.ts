process.env.PUBLIC_CARD_THROTTLE_TTL_SECONDS = '60';
process.env.PUBLIC_CARD_THROTTLE_LIMIT = '3';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const baseDate = new Date('2026-04-01T10:00:00Z');

const cardWithPet = {
  id: 'card-1',
  petId: 'pet-1',
  token: 'valid-token',
  qrCodeUrl: 'https://bucket.s3.us-east-1.amazonaws.com/qr-codes/pet-1.png',
  createdAt: baseDate,
  pet: {
    id: 'pet-1',
    name: 'Rex',
    species: 'DOG',
    breed: 'Labrador',
    sex: 'MALE',
    birthDate: new Date('2022-03-10'),
    weight: 12.5,
    photoUrl: null,
    tutor: { name: 'Alice' },
    vaccineRecords: [],
    dewormingRecords: [],
    medicationRecords: [],
  },
};

const mockPrisma = {
  carteiraDigital: {
    findUnique: jest.fn(),
  },
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};

describe('Public card route (e2e)', () => {
  let app: INestApplication<App>;
  let throttlerStorage: ThrottlerStorage & {
    storage?: Map<string, unknown>;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
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

    throttlerStorage = app.get(ThrottlerStorage);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    throttlerStorage.storage?.clear();
    mockPrisma.carteiraDigital.findUnique.mockImplementation(
      ({ where }: { where: { token: string } }) =>
        where.token === 'valid-token'
          ? Promise.resolve(cardWithPet)
          : Promise.resolve(null),
    );
  });

  it('GET /cards/:token returns 200 and the public card payload for a valid token', async () => {
    await request(app.getHttpServer())
      .get('/cards/valid-token')
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({
          pet_id: 'pet-1',
          pet_name: 'Rex',
          tutor_name: 'Alice',
        });
      });
  });

  it('GET /cards/:token returns 404 when the token does not exist', async () => {
    await request(app.getHttpServer()).get('/cards/does-not-exist').expect(404);
  });

  it('GET /cards/:token returns 429 once the per-IP rate limit is exceeded', async () => {
    const limit = Number(process.env.PUBLIC_CARD_THROTTLE_LIMIT);
    for (let i = 0; i < limit; i++) {
      await request(app.getHttpServer()).get('/cards/valid-token').expect(200);
    }

    await request(app.getHttpServer()).get('/cards/valid-token').expect(429);
  });
});
