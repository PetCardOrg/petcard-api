/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { createE2EApp, E2EApp } from '../utils/e2e-app';
import { createAndLoginVet, registerTutor, resetDb } from '../utils/e2e-db';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Lista de pets do veterinário (vínculo explícito).
 *
 * Antes o dashboard era derivado dos registros clínicos vivos: apagar o
 * próprio registro fazia o pet sumir da lista, e sem scanner na web não havia
 * como trazer um pet novo. Estes testes exercitam o caminho que substituiu
 * isso — entra pelo token do QR, sai só por remoção explícita.
 */
describe('Pets atendidos pelo veterinário (e2e)', () => {
  let ctx: E2EApp;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tutorToken: string;
  let vetToken: string;
  let petId: string;

  const TOKEN_QR = 'qr-token-rex';

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

    await prisma.carteiraDigital.create({
      data: { petId, token: TOKEN_QR },
    });
  });

  function adicionarPeloQr(token = TOKEN_QR) {
    return request(app.getHttpServer())
      .post('/veterinarios/me/pets')
      .set('Authorization', `Bearer ${vetToken}`)
      .send({ token });
  }

  async function listarDashboard() {
    const res = await request(app.getHttpServer())
      .get('/veterinarios/dashboard/pets')
      .set('Authorization', `Bearer ${vetToken}`)
      .expect(200);
    return res.body as { total: number; items: { id: string }[] };
  }

  async function aplicarVacina(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/pets/${petId}/vaccines`)
      .set('Authorization', `Bearer ${vetToken}`)
      .send({
        pet_id: petId,
        vaccine_name: 'Antirrábica',
        applied_at: '2026-08-19',
      })
      .expect(201);
    return res.body.id as string;
  }

  it('o pet entra na lista ao abrir a carteira pelo token do QR', async () => {
    expect((await listarDashboard()).total).toBe(0);

    const res = await adicionarPeloQr().expect(200);
    expect(res.body).toMatchObject({ pet_id: petId, novo: true });

    const dashboard = await listarDashboard();
    expect(dashboard.total).toBe(1);
    expect(dashboard.items[0].id).toBe(petId);
  });

  it('reabrir a carteira não duplica o pet na lista', async () => {
    await adicionarPeloQr().expect(200);
    const segunda = await adicionarPeloQr().expect(200);

    expect(segunda.body.novo).toBe(false);
    expect((await listarDashboard()).total).toBe(1);
  });

  it('o pet continua na lista depois de apagar o registro que o vet fez', async () => {
    // Era exatamente o defeito: a lista vinha dos registros vivos.
    await adicionarPeloQr().expect(200);
    const vacinaId = await aplicarVacina();

    await request(app.getHttpServer())
      .delete(`/vaccines/${vacinaId}`)
      .set('Authorization', `Bearer ${vetToken}`)
      .expect(204);

    const dashboard = await listarDashboard();
    expect(dashboard.total).toBe(1);
    expect(dashboard.items[0].id).toBe(petId);
  });

  it('registrar no pet o traz para a lista mesmo sem passar pelo QR', async () => {
    await aplicarVacina();

    expect((await listarDashboard()).total).toBe(1);
  });

  it('o pet sai da lista só quando o veterinário remove', async () => {
    await adicionarPeloQr().expect(200);

    await request(app.getHttpServer())
      .delete(`/veterinarios/me/pets/${petId}`)
      .set('Authorization', `Bearer ${vetToken}`)
      .expect(204);

    expect((await listarDashboard()).total).toBe(0);

    // Some o vínculo, não o pet nem o que foi registrado nele.
    const pet = await prisma.pet.findUnique({ where: { id: petId } });
    expect(pet).not.toBeNull();
  });

  it('remover pet que não está na lista devolve 404', async () => {
    await request(app.getHttpServer())
      .delete(`/veterinarios/me/pets/${petId}`)
      .set('Authorization', `Bearer ${vetToken}`)
      .expect(404);
  });

  it('token inexistente não vincula nada (404)', async () => {
    await adicionarPeloQr('token-que-nao-existe').expect(404);

    expect((await listarDashboard()).total).toBe(0);
  });

  it('a lista de um veterinário não vaza para outro', async () => {
    await adicionarPeloQr().expect(200);

    const { token: outroVet } = await createAndLoginVet(app, prisma, {
      email: 'outro@petcard.com',
      crmv: 'CRMV-CE-9999',
    });

    const res = await request(app.getHttpServer())
      .get('/veterinarios/dashboard/pets')
      .set('Authorization', `Bearer ${outroVet}`)
      .expect(200);

    expect(res.body.total).toBe(0);
  });

  it('veterinário sem CRMV verificado não adiciona pet pelo QR (403)', async () => {
    const { token: semCrmv } = await createAndLoginVet(app, prisma, {
      email: 'sem-crmv@petcard.com',
      crmv: 'CRMV-CE-5555',
      crmvVerificado: false,
    });

    await request(app.getHttpServer())
      .post('/veterinarios/me/pets')
      .set('Authorization', `Bearer ${semCrmv}`)
      .send({ token: TOKEN_QR })
      .expect(403);
  });
});
