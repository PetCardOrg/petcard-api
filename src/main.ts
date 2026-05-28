import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import {
  CALENDAR_SYNC_DLQ_ROUTING_KEY,
  CALENDAR_SYNC_DLX,
  NOTIFICATION_PUSH_DLQ_ROUTING_KEY,
  NOTIFICATION_PUSH_DLX,
  QR_CODE_DLQ_ROUTING_KEY,
  QR_CODE_DLX,
} from './modules/queue/queue.constants';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.enableCors({
    origin: config.get<string[]>('app.corsOrigins'),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [config.get<string>('rabbitmq.url')!],
      queue: config.get<string>('rabbitmq.qrCodeQueue')!,
      queueOptions: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': QR_CODE_DLX,
          'x-dead-letter-routing-key': QR_CODE_DLQ_ROUTING_KEY,
        },
      },
      noAck: false,
      prefetchCount: 1,
    },
  });

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [config.get<string>('rabbitmq.url')!],
      queue: config.get<string>('rabbitmq.notificationPushQueue')!,
      queueOptions: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': NOTIFICATION_PUSH_DLX,
          'x-dead-letter-routing-key': NOTIFICATION_PUSH_DLQ_ROUTING_KEY,
        },
      },
      noAck: false,
      prefetchCount: 1,
    },
  });

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [config.get<string>('rabbitmq.url')!],
      queue: config.get<string>('rabbitmq.calendarSyncQueue')!,
      queueOptions: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': CALENDAR_SYNC_DLX,
          'x-dead-letter-routing-key': CALENDAR_SYNC_DLQ_ROUTING_KEY,
        },
      },
      noAck: false,
      prefetchCount: 1,
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
