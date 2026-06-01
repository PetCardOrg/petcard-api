/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { NotificationPushPublisher } from '../src/modules/queue/notification-push.publisher';
import { QrCodePublisher } from '../src/modules/queue/qr-code.publisher';
import { PrismaService } from '../src/prisma/prisma.service';

type Ctx = {
  sub: string;
  email: string;
  role: 'TUTOR' | 'VET';
  permissions: string[];
};
const tutorCtx: Ctx = {
  sub: '22222222-2222-4222-8222-222222222222',
  email: 'tutor@petcard.com',
  role: 'TUTOR',
  permissions: ['TUTOR'],
};

let currentUser: Ctx | null = tutorCtx;

const tutor1 = {
  id: '22222222-2222-4222-8222-222222222222',
  auth0Id: 'auth0|tutor-1',
  name: 'Alice',
  email: 'tutor@petcard.com',
  role: 'TUTOR',
  timezone: 'America/Fortaleza',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const mockPrisma = {
  tutor: { findUnique: jest.fn() },
  deviceToken: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  notification: { create: jest.fn() },
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};

describe('DevicesController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(QrCodePublisher)
      .useValue({ publishGenerate: jest.fn().mockResolvedValue(undefined) })
      .overrideProvider(NotificationPushPublisher)
      .useValue({ publish: jest.fn().mockResolvedValue(undefined) })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { user: Ctx | null } };
        }) => {
          const req = context.switchToHttp().getRequest();
          if (!currentUser) return false;
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
      ({ where }: { where: { id?: string } }) =>
        where.id === tutor1.id
          ? Promise.resolve(tutor1)
          : Promise.resolve(null),
    );
    mockPrisma.deviceToken.findUnique.mockResolvedValue(null);
    mockPrisma.deviceToken.upsert.mockImplementation(
      ({ create }: { create: Record<string, unknown> }) =>
        Promise.resolve({ id: 'd-uuid', ...create, lastSeenAt: new Date() }),
    );
  });

  it('POST /devices — 201 on valid payload', async () => {
    const res = await request(app.getHttpServer())
      .post('/devices')
      .send({
        token: 'fcm-token-abcdefghij',
        platform: 'IOS',
      })
      .expect(201);

    expect(res.body.token).toBe('fcm-token-abcdefghij');
    expect(res.body.platform).toBe('IOS');
    expect(mockPrisma.deviceToken.upsert).toHaveBeenCalled();
  });

  it('POST /devices — 401 when unauthenticated', async () => {
    currentUser = null;
    await request(app.getHttpServer())
      .post('/devices')
      .send({ token: 'fcm-token-abcdefghij', platform: 'IOS' })
      .expect(403);
  });

  it('POST /devices — 400 on invalid platform', async () => {
    await request(app.getHttpServer())
      .post('/devices')
      .send({ token: 'fcm-token-abcdefghij', platform: 'WEB' })
      .expect(400);
  });

  it('POST /devices — 400 on missing token', async () => {
    await request(app.getHttpServer())
      .post('/devices')
      .send({ platform: 'IOS' })
      .expect(400);
  });
});
