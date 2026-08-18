/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { createE2EApp, E2EApp } from '../utils/e2e-app';
import { createAndLoginVet, registerTutor, resetDb } from '../utils/e2e-db';
import { PrismaService } from '../../src/prisma/prisma.service';
import type {
  HistoricoClinicoItemResponseDto,
  HistoricoClinicoResponseDto,
} from '@petcardorg/shared';

function acharItem(
  body: HistoricoClinicoResponseDto,
  entidadeId: string,
): HistoricoClinicoItemResponseDto | undefined {
  return body.itens.find((i) => i.entidade_id === entidadeId);
}

describe('Histórico clínico (e2e)', () => {
  let ctx: E2EApp;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tutorToken: string;
  let tutorId: string;
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
    const tutor = await registerTutor(app);
    tutorToken = tutor.token;
    tutorId = tutor.user.id;
    ({ token: vetToken } = await createAndLoginVet(app, prisma));

    const pet = await request(app.getHttpServer())
      .post('/pets')
      .set('Authorization', `Bearer ${tutorToken}`)
      .send({ name: 'Rex', species: 'DOG', sex: 'MALE' })
      .expect(201);
    petId = pet.body.id as string;
  });

  async function prescreverMedicacao(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/pets/${petId}/medications`)
      .set('Authorization', `Bearer ${vetToken}`)
      .send({
        pet_id: petId,
        medication_name: 'Amoxicilina',
        dosage: '250mg',
        frequency: '12/12h',
        start_date: '2026-03-10',
      })
      .expect(201);
    return res.body.id as string;
  }

  it('o tutor apaga a prescrição, mas ela permanece no histórico', async () => {
    const medId = await prescreverMedicacao();

    await request(app.getHttpServer())
      .delete(`/medications/${medId}`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .expect(204);

    // Sumiu da listagem do tutor...
    const lista = await request(app.getHttpServer())
      .get(`/pets/${petId}/medications`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .expect(200);
    expect(lista.body).toHaveLength(0);

    // ...mas continua no histórico, marcada como excluída.
    const historico = await request(app.getHttpServer())
      .get(`/pets/${petId}/historico-clinico`)
      .set('Authorization', `Bearer ${vetToken}`)
      .expect(200);

    const item = acharItem(
      historico.body as HistoricoClinicoResponseDto,
      medId,
    );
    expect(item).toBeDefined();
    expect(item!.excluido).toBe(true);
    expect(item!.titulo).toBe('Amoxicilina');

    // E a linha continua no banco.
    const noBanco = await prisma.medicationRecord.findUnique({
      where: { id: medId },
    });
    expect(noBanco).not.toBeNull();
    expect(noBanco?.deletedAt).not.toBeNull();
  });

  it('registra quem prescreveu, com CRMV, e quem apagou', async () => {
    const medId = await prescreverMedicacao();
    await request(app.getHttpServer())
      .delete(`/medications/${medId}`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .expect(204);

    const historico = await request(app.getHttpServer())
      .get(`/pets/${petId}/historico-clinico`)
      .set('Authorization', `Bearer ${vetToken}`)
      .expect(200);

    const item = acharItem(
      historico.body as HistoricoClinicoResponseDto,
      medId,
    )!;
    expect(item.veterinario_crmv).toBe('CRMV-CE-1234');

    const tipos = item.acoes.map((a) => a.tipo);
    expect(tipos).toEqual(['CRIACAO', 'EXCLUSAO']);

    const criacao = item.acoes[0];
    expect(criacao.autor_tipo).toBe('VET');
    expect(criacao.autor_crmv).toBe('CRMV-CE-1234');

    const exclusao = item.acoes[1];
    expect(exclusao.autor_tipo).toBe('TUTOR');
    expect(exclusao.autor_id).toBe(tutorId);
  });

  it('a trilha sobrevive à exclusão da conta do veterinário', async () => {
    const medId = await prescreverMedicacao();
    const vet = await prisma.veterinario.findFirstOrThrow();

    await prisma.veterinario.delete({ where: { id: vet.id } });

    const acoes = await prisma.acaoClinica.findMany({
      where: { entidadeId: medId },
    });
    // Nome e CRMV estão gravados na trilha, não referenciados.
    expect(acoes[0].autorNome).toBe('Dra. Camila');
    expect(acoes[0].autorCrmv).toBe('CRMV-CE-1234');
  });

  it('a edição entra na trilha com o antes e o depois', async () => {
    const medId = await prescreverMedicacao();

    await request(app.getHttpServer())
      .patch(`/medications/${medId}`)
      .set('Authorization', `Bearer ${vetToken}`)
      .send({ dosage: '500mg' })
      .expect(200);

    const acoes = await prisma.acaoClinica.findMany({
      where: { entidadeId: medId, tipo: 'EDICAO' },
    });
    expect(acoes).toHaveLength(1);
    const detalhes = acoes[0].detalhes as {
      antes: { dosage: string };
      depois: { dosage: string };
    };
    expect(detalhes.antes.dosage).toBe('250mg');
    expect(detalhes.depois.dosage).toBe('500mg');
  });

  it('o tutor não edita a prescrição do veterinário (403)', async () => {
    const medId = await prescreverMedicacao();

    // Editar mantendo a assinatura do veterinário falsificaria a autoria: a
    // carteira continuaria dizendo "prescrito por Dra. Camila, CRMV-CE-1234"
    // sobre uma dosagem que ela não prescreveu (web#34).
    await request(app.getHttpServer())
      .patch(`/medications/${medId}`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .send({ dosage: '500mg' })
      .expect(403);

    const noBanco = await prisma.medicationRecord.findUnique({
      where: { id: medId },
    });
    expect(noBanco?.dosage).toBe('250mg');
  });

  it('o veterinário remove a própria prescrição, o tutor não perde a dele', async () => {
    const medId = await prescreverMedicacao();

    // Registro declarado pelo tutor: não é do veterinário para apagar.
    const doTutor = await request(app.getHttpServer())
      .post(`/pets/${petId}/medications`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .send({
        pet_id: petId,
        medication_name: 'Suplemento',
        dosage: '1 comprimido',
        frequency: '24/24h',
        start_date: '2026-03-10',
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/medications/${medId}`)
      .set('Authorization', `Bearer ${vetToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .delete(`/medications/${doTutor.body.id as string}`)
      .set('Authorization', `Bearer ${vetToken}`)
      .expect(403);
  });

  it('proíbe tutor que não é dono de ver o histórico (403)', async () => {
    const { token: outro } = await registerTutor(app, {
      email: 'outro@petcard.com',
    });

    await request(app.getHttpServer())
      .get(`/pets/${petId}/historico-clinico`)
      .set('Authorization', `Bearer ${outro}`)
      .expect(403);
  });

  it('vacina excluída some da carteira pública', async () => {
    const vacina = await request(app.getHttpServer())
      .post(`/pets/${petId}/vaccines`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .send({
        pet_id: petId,
        vaccine_name: 'Antirrábica',
        applied_at: '2026-02-01',
      })
      .expect(201);

    const card = await request(app.getHttpServer())
      .get(`/cards/pets/${petId}`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .expect(200);
    const token = (card.body.public_url as string).split('/').pop()!;

    await request(app.getHttpServer())
      .delete(`/vaccines/${vacina.body.id}`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .expect(204);

    const publica = await request(app.getHttpServer())
      .get(`/cards/${token}`)
      .expect(200);
    expect(publica.body.vaccines).toHaveLength(0);
  });
});
