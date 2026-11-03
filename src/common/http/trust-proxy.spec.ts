import { Controller, Get, UseGuards } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { confiarNoProxyReverso } from './trust-proxy';

@Controller('limitada')
@UseGuards(ThrottlerGuard)
class RotaLimitadaController {
  @Get()
  responder() {
    return { ok: true };
  }
}

/**
 * Atrás do proxy do Render, todas as conexões chegam do mesmo IP. Sem
 * `trust proxy`, o throttler usa esse IP como chave e todos os usuários
 * dividem um balde só: o 11º login por minuto, somando todo mundo, toma 429.
 */
describe('confiarNoProxyReverso', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1 }])],
      controllers: [RotaLimitadaController],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    confiarNoProxyReverso(app);
    await app.init();
  });

  afterEach(() => app.close());

  const chamarDe = (xForwardedFor: string) =>
    request(app.getHttpServer())
      .get('/limitada')
      .set('X-Forwarded-For', xForwardedFor);

  it('usuários diferentes atrás do proxy têm baldes diferentes', async () => {
    await chamarDe('203.0.113.10').expect(200);
    await chamarDe('198.51.100.20').expect(200);

    // O mesmo usuário continua limitado.
    await chamarDe('203.0.113.10').expect(429);
  });

  it('o cliente não escapa do limite forjando X-Forwarded-For', async () => {
    // O proxy acrescenta o IP real no fim da lista; o que vem antes foi o
    // cliente quem escreveu. Com um hop só, vale o último.
    await chamarDe('1.1.1.1, 203.0.113.10').expect(200);
    await chamarDe('2.2.2.2, 203.0.113.10').expect(429);
  });
});
