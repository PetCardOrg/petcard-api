import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { CalendarSyncPublisher } from '../../src/modules/queue/calendar-sync.publisher';
import { NotificationPushPublisher } from '../../src/modules/queue/notification-push.publisher';
import { QrCodePublisher } from '../../src/modules/queue/qr-code.publisher';
import { RabbitMqTopologyService } from '../../src/modules/queue/rabbitmq-topology.service';
import { PrismaService } from '../../src/prisma/prisma.service';

export interface E2EApp {
  app: INestApplication<App>;
  prisma: PrismaService;
  /** Publishers de fila mockados — disponíveis para assertir o efeito colateral. */
  publishers: {
    qrCode: { publishGenerate: jest.Mock };
    notificationPush: { publish: jest.Mock };
    calendarSync: { publish: jest.Mock };
  };
}

/**
 * Sobe o `AppModule` REAL contra um Postgres de teste (Prisma real, migrations
 * já aplicadas). Apenas a infraestrutura externa é substituída: a topologia do
 * RabbitMQ (que conectaria no broker no boot) vira no-op e os três publishers de
 * fila viram mocks — assim o app inicializa sem broker e os fluxos exercitam o
 * caminho real de HTTP + guards + DTOs + banco. FCM fica desabilitado por env
 * (`FCM_ENABLED=false`), então não há cliente externo a mockar.
 */
export async function createE2EApp(): Promise<E2EApp> {
  const qrCode = { publishGenerate: jest.fn().mockResolvedValue(undefined) };
  const notificationPush = { publish: jest.fn().mockResolvedValue(undefined) };
  const calendarSync = { publish: jest.fn().mockResolvedValue(undefined) };

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(RabbitMqTopologyService)
    .useValue({ onModuleInit: () => Promise.resolve() })
    .overrideProvider(QrCodePublisher)
    .useValue(qrCode)
    .overrideProvider(NotificationPushPublisher)
    .useValue(notificationPush)
    .overrideProvider(CalendarSyncPublisher)
    .useValue(calendarSync)
    .compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  return {
    app,
    prisma: app.get(PrismaService),
    publishers: { qrCode, notificationPush, calendarSync },
  };
}
