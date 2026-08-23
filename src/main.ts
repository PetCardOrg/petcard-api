import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import {
  CALENDAR_SYNC_DLQ_ROUTING_KEY,
  CALENDAR_SYNC_DLX,
  NOTIFICATION_PUSH_DLQ_ROUTING_KEY,
  NOTIFICATION_PUSH_DLX,
  QR_CODE_DLQ_ROUTING_KEY,
  QR_CODE_DLX,
} from './modules/queue/queue.constants';

/** Tamanho máximo de um corpo JSON aceito. Uploads vão por multipart. */
const JSON_BODY_LIMIT = '1mb';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Cabeçalhos de segurança (HSTS, X-Content-Type-Options, frame-ancestors e
  // afins). A API responde JSON e as duas páginas HTML do fluxo OAuth, que não
  // carregam script externo — daí a CSP fechada.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          formAction: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  // Teto do corpo das requisições: sem ele o Express aceita payload de
  // qualquer tamanho e um POST grande vira consumo de memória do processo.
  app.use(json({ limit: JSON_BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));

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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('PetCard API')
    .setDescription(
      'API REST do PetCard — carteira digital de saúde para pets. ' +
        'Autenticação via JWT (Bearer). Endpoints de tutor, pet, prontuário ' +
        '(vacina/vermífugo/medicação), carteira digital/QR, clínicas, ' +
        'agendamento/Calendar, notificações e interface do veterinário.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

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
