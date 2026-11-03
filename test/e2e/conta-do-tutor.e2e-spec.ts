/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { createE2EApp, E2EApp } from '../utils/e2e-app';
import {
  createAndLoginVet,
  registerTutor,
  resetDb,
  vincularPetAoVet,
} from '../utils/e2e-db';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Exclusão definitiva da conta do tutor.
 *
 * O cascata é do banco, então só um Postgres de verdade prova que ele existe:
 * o `Pet` apontava para `Tutor` sem `onDelete`, o que em Prisma é `Restrict` —
 * apagar tutor com pet falhava com erro de chave estrangeira.
 */
describe('Conta do tutor — exclusão (e2e)', () => {
  let ctx: E2EApp;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tutorToken: string;
  let tutorId: string;
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
    const tutor = await registerTutor(app);
    tutorToken = tutor.token;
    tutorId = tutor.user.id;

    const pet = await request(app.getHttpServer())
      .post('/pets')
      .set('Authorization', `Bearer ${tutorToken}`)
      .send({ name: 'Rex', species: 'DOG', sex: 'MALE' })
      .expect(201);
    petId = pet.body.id as string;
  });

  it('apaga a conta e leva junto pets, prontuário e carteira', async () => {
    await request(app.getHttpServer())
      .post(`/pets/${petId}/vaccines`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .send({ pet_id: petId, vaccine_name: 'V8', applied_at: '2026-01-10' })
      .expect(201);

    await request(app.getHttpServer())
      .delete('/tutors/me')
      .set('Authorization', `Bearer ${tutorToken}`)
      .send({ senha_atual: 'Senha123!' })
      .expect(204);

    expect(
      await prisma.tutor.findUnique({ where: { id: tutorId } }),
    ).toBeNull();
    expect(await prisma.pet.count()).toBe(0);
    expect(await prisma.vaccineRecord.count()).toBe(0);
    expect(await prisma.carteiraDigital.count()).toBe(0);
  });

  it('desfaz o vínculo com o veterinário que atendia o pet', async () => {
    const vet = await createAndLoginVet(app, prisma);
    await vincularPetAoVet(prisma, vet.user.id, petId);

    await request(app.getHttpServer())
      .delete('/tutors/me')
      .set('Authorization', `Bearer ${tutorToken}`)
      .send({ senha_atual: 'Senha123!' })
      .expect(204);

    // O veterinário continua existindo; some só o pet da lista dele.
    expect(await prisma.petAtendido.count()).toBe(0);
    expect(
      await prisma.veterinario.findUnique({ where: { id: vet.user.id } }),
    ).not.toBeNull();
  });

  it('não apaga nada com a senha atual errada (AUD API-04)', async () => {
    await request(app.getHttpServer())
      .delete('/tutors/me')
      .set('Authorization', `Bearer ${tutorToken}`)
      .send({ senha_atual: 'Chute123!' })
      .expect(401);

    expect(
      await prisma.tutor.findUnique({ where: { id: tutorId } }),
    ).not.toBeNull();
    expect(await prisma.pet.count()).toBe(1);
  });

  it('o token deixa de servir depois da exclusão', async () => {
    await request(app.getHttpServer())
      .delete('/tutors/me')
      .set('Authorization', `Bearer ${tutorToken}`)
      .send({ senha_atual: 'Senha123!' })
      .expect(204);

    // O JWT continua com assinatura válida até expirar, mas não há mais conta
    // por trás dele. A recusa passou a vir da própria autenticação (401), não
    // mais de cada rota que resolvia o tutor e devolvia 404: a JwtStrategy
    // confere a conta antes de a request chegar ao controller.
    await request(app.getHttpServer())
      .get('/tutors/me')
      .set('Authorization', `Bearer ${tutorToken}`)
      .expect(401);
  });
});

/**
 * Trocar o e-mail é trocar a identidade da conta (AUD API-04): com só o token,
 * quem o pegasse trocava o e-mail, pedia "esqueci a senha" e ficava com a
 * conta.
 */
describe('Conta do tutor — troca de e-mail (e2e)', () => {
  let ctx: E2EApp;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tutorToken: string;

  beforeAll(async () => {
    ctx = await createE2EApp();
    ({ app, prisma } = ctx);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    tutorToken = (await registerTutor(app)).token;
  });

  it('recusa sem a senha atual (400) e com a senha errada (401)', async () => {
    await request(app.getHttpServer())
      .patch('/tutors/me')
      .set('Authorization', `Bearer ${tutorToken}`)
      .send({ email: 'novo@petcard.com' })
      .expect(400);

    await request(app.getHttpServer())
      .patch('/tutors/me')
      .set('Authorization', `Bearer ${tutorToken}`)
      .send({ email: 'novo@petcard.com', senha_atual: 'Chute123!' })
      .expect(401);

    expect(
      await prisma.tutor.count({ where: { email: 'novo@petcard.com' } }),
    ).toBe(0);
  });

  it('troca com a senha atual correta e encerra a sessão anterior', async () => {
    await request(app.getHttpServer())
      .patch('/tutors/me')
      .set('Authorization', `Bearer ${tutorToken}`)
      .send({ email: 'novo@petcard.com', senha_atual: 'Senha123!' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'novo@petcard.com', password: 'Senha123!' })
      .expect(201);

    // A sessão de antes da troca cai junto — inclusive a de quem trocou.
    await request(app.getHttpServer())
      .get('/tutors/me')
      .set('Authorization', `Bearer ${tutorToken}`)
      .expect(401);
  });
});
