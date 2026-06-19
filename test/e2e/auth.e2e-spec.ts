/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { createE2EApp } from '../utils/e2e-app';
import { createAndLoginVet, registerTutor, resetDb } from '../utils/e2e-db';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createE2EApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  describe('Tutor', () => {
    it('registra, autentica e acessa o próprio perfil com JWT real', async () => {
      const { token, user } = await registerTutor(app);
      expect(user.email).toBe('tutor@petcard.com');

      // O tutor foi de fato persistido com senha cifrada (bcrypt).
      const stored = await prisma.tutor.findUnique({
        where: { email: 'tutor@petcard.com' },
      });
      expect(stored).not.toBeNull();
      expect(stored?.password).not.toBe('senha123');

      const me = await request(app.getHttpServer())
        .get('/tutors/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(me.body.id).toBe(user.id);
      expect(me.body.email).toBe('tutor@petcard.com');
    });

    it('faz login após o registro', async () => {
      await registerTutor(app, { email: 'login@petcard.com' });

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'login@petcard.com', password: 'senha123' })
        .expect(201);
      expect(res.body.access_token).toEqual(expect.any(String));
    });

    it('rejeita registro com email duplicado (409)', async () => {
      await registerTutor(app, { email: 'dup@petcard.com' });

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Outra', email: 'dup@petcard.com', password: 'senha123' })
        .expect(409);
    });

    it('rejeita login com senha errada (401)', async () => {
      await registerTutor(app, { email: 'wrong@petcard.com' });

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'wrong@petcard.com', password: 'errada' })
        .expect(401);
    });

    it('rejeita payload de registro inválido (400)', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'X', email: 'nao-email', password: '123' })
        .expect(400);
    });

    it('bloqueia /tutors/me sem token (401)', async () => {
      await request(app.getHttpServer()).get('/tutors/me').expect(401);
    });
  });

  describe('Veterinário', () => {
    it('faz login e acessa o perfil de vet', async () => {
      const { token, user } = await createAndLoginVet(app, prisma);
      expect(user.crmv).toBe('CRMV-CE-1234');

      const profile = await request(app.getHttpServer())
        .get('/auth/veterinario/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(profile.body.email).toBe('vet@petcard.com');
    });

    it('proíbe tutor no perfil de vet (403)', async () => {
      const { token } = await registerTutor(app);

      await request(app.getHttpServer())
        .get('/auth/veterinario/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });
});
