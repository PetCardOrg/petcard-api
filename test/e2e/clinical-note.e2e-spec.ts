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

describe('Nota clínica — escrita reversa (e2e)', () => {
  let ctx: E2EApp;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tutorToken: string;
  let vetToken: string;
  let vetId: string;
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
    const vet = await createAndLoginVet(app, prisma);
    vetToken = vet.token;
    vetId = vet.user.id;

    const pet = await request(app.getHttpServer())
      .post('/pets')
      .set('Authorization', `Bearer ${tutorToken}`)
      .send({ name: 'Rex', species: 'DOG', sex: 'MALE' })
      .expect(201);
    petId = pet.body.id as string;

    // O atendimento começa pela leitura do QR Code da carteira; sem esse
    // vínculo o prontuário não abre para o vet.
    await vincularPetAoVet(prisma, vetId, petId);
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

  it('proíbe VET que não atende o pet de criar nota (403)', async () => {
    // Só o papel VET não basta: sem a leitura do QR Code o pet não está na
    // lista dele, e o prontuário permanece fechado.
    await prisma.petAtendido.deleteMany({ where: { petId } });

    await request(app.getHttpServer())
      .post(`/pets/${petId}/clinical-notes`)
      .set('Authorization', `Bearer ${vetToken}`)
      .send({ diagnostico: 'Otite externa' })
      .expect(403);

    expect(await prisma.notaClinica.count()).toBe(0);
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

  it('proíbe VET sem CRMV verificado de criar nota (403)', async () => {
    const { token: naoVerificado } = await createAndLoginVet(app, prisma, {
      nome: 'Dr. Marcos',
      email: 'marcos@petcard.com',
      crmv: 'CRMV-CE-9999',
      crmvVerificado: false,
    });

    await request(app.getHttpServer())
      .post(`/pets/${petId}/clinical-notes`)
      .set('Authorization', `Bearer ${naoVerificado}`)
      .send({ diagnostico: 'Sem registro verificado' })
      .expect(403);

    expect(await prisma.notaClinica.count()).toBe(0);
  });

  /**
   * ADR-009. Antes a FK cascateava: o veterinário encerrar a própria conta
   * apagava o diagnóstico da carteira de um pet que não é dele, e a
   * `AcaoClinica` — que não tem FK — continuava afirmando que a nota existia.
   *
   * O `onDelete` é do banco, então só um Postgres de verdade prova o
   * comportamento; mesma razão do e2e de exclusão de conta do tutor.
   */
  it('mantém a nota depois que o veterinário exclui a própria conta', async () => {
    const criada = await request(app.getHttpServer())
      .post(`/pets/${petId}/clinical-notes`)
      .set('Authorization', `Bearer ${vetToken}`)
      .send({ diagnostico: 'Otite externa', prescricao: 'Antibiótico 7 dias' })
      .expect(201);
    const notaId = criada.body.id as string;

    await request(app.getHttpServer())
      .delete('/veterinarios/me')
      .set('Authorization', `Bearer ${vetToken}`)
      .expect(204);

    expect(
      await prisma.veterinario.findUnique({ where: { id: vetId } }),
    ).toBeNull();

    const nota = await prisma.notaClinica.findUnique({ where: { id: notaId } });
    expect(nota).not.toBeNull();
    // O vínculo com a conta some; a assinatura, não.
    expect(nota?.veterinarioId).toBeNull();
    expect(nota?.veterinarioNome).toBe('Dra. Camila');
    expect(nota?.veterinarioCrmv).toBe('CRMV-CE-1234');
    expect(nota?.diagnostico).toBe('Otite externa');

    // O tutor continua enxergando o diagnóstico do próprio pet, assinado.
    const lista = await request(app.getHttpServer())
      .get(`/pets/${petId}/clinical-notes`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .expect(200);
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0]).toMatchObject({
      id: notaId,
      diagnostico: 'Otite externa',
      veterinario_nome: 'Dra. Camila',
      veterinario_crmv: 'CRMV-CE-1234',
    });
    // Sem autor ativo: é por esta ausência que a UI não oferece edição.
    expect(lista.body[0].veterinario_id).toBeUndefined();

    // A trilha da api#117 deixa de ser referência quebrada: a ação registrada
    // aponta para uma nota que continua existindo.
    const acoes = await prisma.acaoClinica.findMany({
      where: { entidade: 'NOTA_CLINICA', entidadeId: notaId },
    });
    expect(acoes).toHaveLength(1);
    expect(acoes[0].autorNome).toBe('Dra. Camila');

    const historico = await request(app.getHttpServer())
      .get(`/pets/${petId}/historico-clinico`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .expect(200);
    expect(historico.body.itens).toHaveLength(1);
    expect(historico.body.itens[0]).toMatchObject({
      entidade_id: notaId,
      veterinario_nome: 'Dra. Camila',
    });
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
