import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ReminderTriggerController } from '../reminder-trigger.controller';
import { ReminderTriggerService } from '../reminder-trigger.service';

const SEGREDO = 'a'.repeat(32);

/**
 * A rota é `@Public()` (quem chama é o GitHub Actions, sem JWT); o segredo no
 * cabeçalho é a única barreira entre a internet e o disparo de push em massa.
 */
describe('POST /internal/reminders/run', () => {
  let app: INestApplication<App>;
  let trigger: { runAll: jest.Mock };

  async function montar(segredo: string | undefined) {
    trigger = { runAll: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      controllers: [ReminderTriggerController],
      providers: [
        { provide: ReminderTriggerService, useValue: trigger },
        {
          provide: ConfigService,
          useValue: { get: () => segredo },
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    await app.init();
  }

  afterEach(() => app.close());

  const disparar = (segredo?: string) => {
    const req = request(app.getHttpServer()).post('/internal/reminders/run');
    return segredo === undefined ? req : req.set('X-Reminders-Secret', segredo);
  };

  it('dispara os lembretes com o segredo certo', async () => {
    await montar(SEGREDO);

    await disparar(SEGREDO).expect(204);
    expect(trigger.runAll).toHaveBeenCalledTimes(1);
  });

  it('recusa sem segredo ou com segredo errado', async () => {
    await montar(SEGREDO);

    await disparar().expect(401);
    await disparar('b'.repeat(32)).expect(401);
    await disparar(SEGREDO.slice(1)).expect(401);
    expect(trigger.runAll).not.toHaveBeenCalled();
  });

  it('some (404) quando o segredo não está configurado', async () => {
    // Fora de produção a variável é opcional: sem ela, nenhum cabeçalho abre.
    await montar(undefined);

    await disparar('').expect(404);
    await disparar(SEGREDO).expect(404);
    expect(trigger.runAll).not.toHaveBeenCalled();
  });
});
