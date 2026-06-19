/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { createE2EApp, E2EApp } from '../utils/e2e-app';
import { createAndLoginVet, registerTutor, resetDb } from '../utils/e2e-db';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Nota clínica — escrita reversa (e2e)', () => {
  let ctx: E2EApp;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tutorToken: string;
  let vetToken: string;
  let petId: string;

  beforeAll(async () => {
    ctx = await createE2EApp();
    ({ app, prisma } = ctx);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    ({ token: tutorToken } = await registerTutor(app));
    ({ token: vetToken } = await createAndLoginVet(app, prisma));

    const pet = await request(app.getHttpServer())
      .post('/pets')
      .set('Authorization', `Bearer ${tutorToken}`)
      .send({ name: 'Rex', species: 'DOG', sex: 'MALE' })
      .expect(201);
    petId = pet.body.id as string;
  });

  it('VET cria a nota, persiste e enfileira o push; tutor consegue lê-la', async () => {
    // Tutor tem um device registrado, então a nota gera notificação na fila.
    await request(app.getHttpServer())
      .post('/devices')
      .set('Authorization', `Bearer ${tutorToken}`)
      .send({ token: 'device-token-1', platform: 'ANDROID' })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post(`/pets/${petId}/clinical-notes`)
      .set('Authorization', `Bearer ${vetToken}`)
      .send({ diagnostico: 'Otite externa', prescricao: 'Antibiótico 7 dias' })
      .expect(201);
    expect(created.body.diagnostico).toBe('Otite externa');
    expect(created.body.veterinario_nome).toBe('Dra. Camila');

    const stored = await prisma.notaClinica.findMany({ where: { petId } });
    expect(stored).toHaveLength(1);
    // A notificação foi persistida e o push, despachado para a fila (mock).
    expect(await prisma.notification.count()).toBe(1);
    expect(ctx.publishers.notificationPush.publish).toHaveBeenCalledTimes(1);

    const list = await request(app.getHttpServer())
      .get(`/pets/${petId}/clinical-notes`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .expect(200);
    expect(list.body).toHaveLength(1);
  });

  it('proíbe o TUTOR de criar nota clínica (403)', async () => {
    await request(app.getHttpServer())
      .post(`/pets/${petId}/clinical-notes`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .send({ diagnostico: 'Tentativa indevida' })
      .expect(403);

    expect(await prisma.notaClinica.count()).toBe(0);
  });

  it('rejeita nota sem diagnóstico (400)', async () => {
    await request(app.getHttpServer())
      .post(`/pets/${petId}/clinical-notes`)
      .set('Authorization', `Bearer ${vetToken}`)
      .send({ prescricao: 'sem diagnóstico' })
      .expect(400);
  });

  it('proíbe tutor que não é dono de listar as notas (403)', async () => {
    const { token: outroToken } = await registerTutor(app, {
      email: 'outro@petcard.com',
    });

    await request(app.getHttpServer())
      .get(`/pets/${petId}/clinical-notes`)
      .set('Authorization', `Bearer ${outroToken}`)
      .expect(403);
  });
});
