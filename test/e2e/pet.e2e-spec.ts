/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { createE2EApp, E2EApp } from '../utils/e2e-app';
import { createAndLoginVet, registerTutor, resetDb } from '../utils/e2e-db';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Pet + prontuário (e2e)', () => {
  let ctx: E2EApp;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tutorToken: string;

  const petPayload = {
    name: 'Rex',
    species: 'DOG',
    sex: 'MALE',
    breed: 'Labrador',
    weight: 20,
    birth_date: '2023-05-01',
  };

  async function createPet(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/pets')
      .set('Authorization', `Bearer ${tutorToken}`)
      .send(petPayload)
      .expect(201);
    return res.body.id as string;
  }

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
  });

  it('cria o pet, persiste no banco e enfileira o QR Code (201)', async () => {
    const res = await request(app.getHttpServer())
      .post('/pets')
      .set('Authorization', `Bearer ${tutorToken}`)
      .send(petPayload)
      .expect(201);

    expect(res.body.name).toBe('Rex');
    const stored = await prisma.pet.findUnique({ where: { id: res.body.id } });
    expect(stored?.name).toBe('Rex');
    expect(ctx.publishers.qrCode.publishGenerate).toHaveBeenCalledWith(
      res.body.id,
    );
  });

  it('lista, lê e atualiza o pet do dono', async () => {
    const petId = await createPet();

    const list = await request(app.getHttpServer())
      .get('/pets')
      .set('Authorization', `Bearer ${tutorToken}`)
      .expect(200);
    expect(list.body).toHaveLength(1);

    await request(app.getHttpServer())
      .get(`/pets/${petId}`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .expect(200);

    const patched = await request(app.getHttpServer())
      .patch(`/pets/${petId}`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .send({ name: 'Rex II' })
      .expect(200);
    expect(patched.body.name).toBe('Rex II');

    const stored = await prisma.pet.findUnique({ where: { id: petId } });
    expect(stored?.name).toBe('Rex II');
  });

  it('remove o pet do dono e some do banco (204)', async () => {
    const petId = await createPet();

    await request(app.getHttpServer())
      .delete(`/pets/${petId}`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .expect(204);

    expect(await prisma.pet.findUnique({ where: { id: petId } })).toBeNull();
  });

  it('proíbe um tutor de ler o pet de outro tutor (403)', async () => {
    const petId = await createPet();
    const { token: outroToken } = await registerTutor(app, {
      email: 'outro@petcard.com',
    });

    await request(app.getHttpServer())
      .get(`/pets/${petId}`)
      .set('Authorization', `Bearer ${outroToken}`)
      .expect(403);
  });

  it('permite que o VET leia o pet de qualquer tutor (200)', async () => {
    const petId = await createPet();
    const { token: vetToken } = await createAndLoginVet(app, prisma);

    await request(app.getHttpServer())
      .get(`/pets/${petId}`)
      .set('Authorization', `Bearer ${vetToken}`)
      .expect(200);
  });

  it('proíbe o VET de criar pet (403)', async () => {
    const { token: vetToken } = await createAndLoginVet(app, prisma);

    await request(app.getHttpServer())
      .post('/pets')
      .set('Authorization', `Bearer ${vetToken}`)
      .send(petPayload)
      .expect(403);
  });

  it('registra e lista uma vacina do pet (prontuário real)', async () => {
    const petId = await createPet();

    const created = await request(app.getHttpServer())
      .post(`/pets/${petId}/vaccines`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .send({
        pet_id: petId,
        vaccine_name: 'Antirrábica',
        applied_at: '2026-01-10',
      })
      .expect(201);
    expect(created.body.vaccine_name).toBe('Antirrábica');

    const list = await request(app.getHttpServer())
      .get(`/pets/${petId}/vaccines`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .expect(200);
    expect(list.body).toHaveLength(1);

    const stored = await prisma.vaccineRecord.findMany({ where: { petId } });
    expect(stored).toHaveLength(1);
  });
});
