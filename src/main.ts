import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { confiarNoProxyReverso } from './common/http/trust-proxy';
import { FILAS, rmqOptions } from './modules/queue/rmq';
import { ReminderTriggerService } from './modules/reminder/reminder-trigger.service';

/** Tamanho máximo de um corpo JSON aceito. Uploads vão por multipart. */
const JSON_BODY_LIMIT = '1mb';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Antes de tudo que lê `req.ip`, a começar pelo rate limit.
  confiarNoProxyReverso(app);

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
  // Publicar o Swagger em produção expõe o mapa completo da API (rotas, DTOs,
  // exemplos) para reconhecimento — só habilitar fora de produção.
  if (config.get<string>('app.nodeEnv') !== 'production') {
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  // Um consumidor por fila. As opções da fila saem do mesmo `rmqOptions` do
  // `QueueModule`: publicador e consumidor precisam declará-la igual.
  const rabbitUrl = config.get<string>('rabbitmq.url')!;
  for (const fila of FILAS) {
    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.RMQ,
      options: {
        ...rmqOptions(
          rabbitUrl,
          config.get<string>(fila.queue)!,
          config.get<string>(fila.dlx)!,
          fila.dlqRoutingKey,
        ),
        noAck: false,
        prefetchCount: 1,
      },
    });
  }

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3000);

  // O Render gratuito dorme e perde o `@Cron` das 9h (AUD API-02): ao acordar,
  // roda o que ficou para trás. Sem `await`, para não segurar o request que
  // acordou o servidor. Fica aqui, e não num hook do módulo, para não rodar
  // nos testes nem no `scripts/run-reminders.ts`.
  void app.get(ReminderTriggerService).runOnBoot();
}
void bootstrap();
