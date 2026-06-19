/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { createE2EApp } from '../utils/e2e-app';
import { registerTutor, resetDb } from '../utils/e2e-db';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Carteira digital (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tutorToken: string;
  let petId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createE2EApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    ({ token: tutorToken } = await registerTutor(app));

    const pet = await request(app.getHttpServer())
      .post('/pets')
      .set('Authorization', `Bearer ${tutorToken}`)
      .send({ name: 'Rex', species: 'DOG', sex: 'MALE', breed: 'SRD' })
      .expect(201);
    petId = pet.body.id as string;
  });

  it('o tutor obtém a carteira do pet, emitindo o token (GET /cards/pets/:petId)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/cards/pets/${petId}`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .expect(200);

    expect(res.body.pet_id).toBe(petId);
    expect(res.body.public_url).toEqual(expect.any(String));

    // A carteira passou a existir no banco.
    const card = await prisma.carteiraDigital.findUnique({ where: { petId } });
    expect(card).not.toBeNull();
  });

  it('serve a carteira pública por token sem autenticação (200)', async () => {
    await prisma.carteiraDigital.create({
      data: { petId, token: 'public-token-abc' },
    });

    const res = await request(app.getHttpServer())
      .get('/cards/public-token-abc')
      .expect(200);

    expect(res.body.pet_name).toBe('Rex');
    expect(res.body.tutor_name).toBe('Alice Tutora');
    expect(res.body.vaccines).toEqual([]);
    expect(res.body.clinical_notes).toEqual([]);
  });

  it('retorna 404 para token inexistente', async () => {
    await request(app.getHttpServer()).get('/cards/nao-existe').expect(404);
  });

  it('proíbe o tutor de ver a carteira de um pet que não é dele (404)', async () => {
    const { token: outroToken } = await registerTutor(app, {
      email: 'outro@petcard.com',
    });

    await request(app.getHttpServer())
      .get(`/cards/pets/${petId}`)
      .set('Authorization', `Bearer ${outroToken}`)
      .expect(404);
  });
});
