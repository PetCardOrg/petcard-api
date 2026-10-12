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
import type {
  AnexoResponseDto,
  HistoricoClinicoResponseDto,
  VaccineRecordResponseDto,
} from '@petcardorg/shared';

const PDF = Buffer.from('%PDF-1.7 carteirinha do Rex');

describe('Anexos de comprovação (e2e)', () => {
  let ctx: E2EApp;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tutorToken: string;
  let vetToken: string;
  let vetId: string;
  let petId: string;
  let vacinaId: string;

  beforeAll(async () => {
    ctx = await createE2EApp();
    ({ app, prisma } = ctx);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    ctx.storage.clear();
    const tutor = await registerTutor(app);
    tutorToken = tutor.token;
    const vet = await createAndLoginVet(app, prisma);
    vetToken = vet.token;
    vetId = vet.user.id;

    const pet = await request(app.getHttpServer())
      .post('/pets')
      .set('Authorization', `Bearer ${tutorToken}`)
      .send({ name: 'Rex', species: 'DOG', sex: 'MALE' })
      .expect(201);
    petId = pet.body.id as string;
    await vincularPetAoVet(prisma, vetId, petId);

    const vacina = await request(app.getHttpServer())
      .post(`/pets/${petId}/vaccines`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .send({ pet_id: petId, vaccine_name: 'Raiva', applied_at: '2026-03-10' })
      .expect(201);
    vacinaId = vacina.body.id as string;
  });

  const anexar = (
    token: string,
    conteudo: Buffer = PDF,
    mime = 'application/pdf',
  ) =>
    request(app.getHttpServer())
      .post(`/pets/${petId}/anexos`)
      .set('Authorization', `Bearer ${token}`)
      .field('entidade', 'VACINA')
      .field('entidade_id', vacinaId)
      .attach('file', conteudo, {
        filename: 'carteirinha.pdf',
        contentType: mime,
      });

  it('tutor anexa o comprovante: nasce não verificado e aparece na vacina', async () => {
    const res = await anexar(tutorToken).expect(201);
    const anexo = res.body as AnexoResponseDto;

    expect(anexo.verificado).toBe(false);
    expect(anexo.enviado_por_tipo).toBe('TUTOR');
    expect(anexo.nome_arquivo).toBe('carteirinha.pdf');
    // O corpo nunca expõe a chave do bucket nem uma URL fixa.
    expect(JSON.stringify(res.body)).not.toContain('anexos/');

    const lista = await request(app.getHttpServer())
      .get(`/pets/${petId}/vaccines`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .expect(200);
    const vacina = (lista.body as VaccineRecordResponseDto[])[0];
    expect(vacina.anexos).toHaveLength(1);
    expect(vacina.anexos![0].id).toBe(anexo.id);

    // Foi guardado, com o hash do conteúdo.
    const noBanco = await prisma.anexoClinico.findUniqueOrThrow({
      where: { id: anexo.id },
    });
    expect(ctx.storage.get(noBanco.s3Key)).toEqual(PDF);
    expect(noBanco.s3Key).toMatch(new RegExp(`^anexos/${petId}/`));
    expect(noBanco.sha256).toHaveLength(64);
  });

  it('veterinário anexa e o comprovante já nasce verificado, com o CRMV', async () => {
    const res = await anexar(vetToken).expect(201);
    const anexo = res.body as AnexoResponseDto;

    expect(anexo.verificado).toBe(true);
    expect(anexo.verificado_por_crmv).toBe('CRMV-CE-1234');
    expect(anexo.enviado_por_tipo).toBe('VET');
  });

  it('veterinário verifica o comprovante do tutor, uma única vez', async () => {
    const criado = (await anexar(tutorToken).expect(201))
      .body as AnexoResponseDto;

    const tutorTentando = await request(app.getHttpServer())
      .post(`/anexos/${criado.id}/verificacao`)
      .set('Authorization', `Bearer ${tutorToken}`);
    expect(tutorTentando.status).toBe(403);

    const res = await request(app.getHttpServer())
      .post(`/anexos/${criado.id}/verificacao`)
      .set('Authorization', `Bearer ${vetToken}`)
      .expect(200);
    expect(res.body.verificado).toBe(true);
    expect(res.body.verificado_por_crmv).toBe('CRMV-CE-1234');

    // Repetir não duplica a ação na trilha.
    await request(app.getHttpServer())
      .post(`/anexos/${criado.id}/verificacao`)
      .set('Authorization', `Bearer ${vetToken}`)
      .expect(200);
    const verificacoes = await prisma.acaoClinica.count({
      where: { tipo: 'ANEXO_VERIFICADO' },
    });
    expect(verificacoes).toBe(1);
  });

  it('veterinário sem vínculo com o pet não verifica nem abre o arquivo', async () => {
    const criado = (await anexar(tutorToken).expect(201))
      .body as AnexoResponseDto;
    await prisma.petAtendido.deleteMany({});

    await request(app.getHttpServer())
      .post(`/anexos/${criado.id}/verificacao`)
      .set('Authorization', `Bearer ${vetToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/anexos/${criado.id}/arquivo`)
      .set('Authorization', `Bearer ${vetToken}`)
      .expect(403);
  });

  it('outro tutor não abre o comprovante alheio', async () => {
    const criado = (await anexar(tutorToken).expect(201))
      .body as AnexoResponseDto;
    const outro = await registerTutor(app, { email: 'outro@petcard.com' });

    const res = await request(app.getHttpServer())
      .get(`/anexos/${criado.id}/arquivo`)
      .set('Authorization', `Bearer ${outro.token}`);
    expect([403, 404]).toContain(res.status);
    await request(app.getHttpServer())
      .post(`/pets/${petId}/anexos`)
      .set('Authorization', `Bearer ${outro.token}`)
      .field('entidade', 'VACINA')
      .field('entidade_id', vacinaId)
      .attach('file', PDF, {
        filename: 'x.pdf',
        contentType: 'application/pdf',
      })
      .expect((r) => expect([403, 404]).toContain(r.status));
  });

  it('GET arquivo devolve link temporário para o dono', async () => {
    const criado = (await anexar(tutorToken).expect(201))
      .body as AnexoResponseDto;

    const res = await request(app.getHttpServer())
      .get(`/anexos/${criado.id}/arquivo`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .expect(200);
    expect(res.body.url).toContain('assinado=1');
    expect(new Date(res.body.expira_em as string).getTime()).toBeGreaterThan(
      Date.now(),
    );
  });

  it('recusa conteúdo que não é o tipo declarado (400) e não guarda nada', async () => {
    await anexar(tutorToken, Buffer.from('<script>x</script>')).expect(400);
    expect(ctx.storage.size).toBe(0);
    expect(await prisma.anexoClinico.count()).toBe(0);
  });

  it('remover é exclusão lógica: sai da vacina, o arquivo e a linha permanecem', async () => {
    const criado = (await anexar(tutorToken).expect(201))
      .body as AnexoResponseDto;

    await request(app.getHttpServer())
      .delete(`/anexos/${criado.id}`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .expect(204);

    const lista = await request(app.getHttpServer())
      .get(`/pets/${petId}/vaccines`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .expect(200);
    expect((lista.body as VaccineRecordResponseDto[])[0].anexos).toHaveLength(
      0,
    );

    // Não abre mais...
    await request(app.getHttpServer())
      .get(`/anexos/${criado.id}/arquivo`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .expect(404);

    // ...mas o registro e o objeto foram preservados.
    const noBanco = await prisma.anexoClinico.findUniqueOrThrow({
      where: { id: criado.id },
    });
    expect(noBanco.deletedAt).not.toBeNull();
    expect(ctx.storage.has(noBanco.s3Key)).toBe(true);
  });

  it('o histórico mostra o comprovante e a trilha de quem anexou, verificou e removeu', async () => {
    const criado = (await anexar(tutorToken).expect(201))
      .body as AnexoResponseDto;
    await request(app.getHttpServer())
      .post(`/anexos/${criado.id}/verificacao`)
      .set('Authorization', `Bearer ${vetToken}`)
      .expect(200);

    const antes = await request(app.getHttpServer())
      .get(`/pets/${petId}/historico-clinico`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .expect(200);
    const item = (antes.body as HistoricoClinicoResponseDto).itens.find(
      (i) => i.entidade_id === vacinaId,
    )!;
    expect(item.anexos).toHaveLength(1);
    expect(item.anexos[0].verificado).toBe(true);
    expect(item.acoes.map((a) => a.tipo)).toEqual([
      'CRIACAO',
      'ANEXO_ADICIONADO',
      'ANEXO_VERIFICADO',
    ]);

    await request(app.getHttpServer())
      .delete(`/anexos/${criado.id}`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .expect(204);
    const depois = await request(app.getHttpServer())
      .get(`/pets/${petId}/historico-clinico`)
      .set('Authorization', `Bearer ${tutorToken}`)
      .expect(200);
    const itemDepois = (depois.body as HistoricoClinicoResponseDto).itens.find(
      (i) => i.entidade_id === vacinaId,
    )!;
    expect(itemDepois.anexos).toHaveLength(0);
    expect(itemDepois.acoes.map((a) => a.tipo)).toContain('ANEXO_REMOVIDO');
  });

  it('carteira pública (QR) não expõe comprovantes', async () => {
    await anexar(tutorToken).expect(201);
    await prisma.carteiraDigital.create({
      data: { petId, token: 'public-token-abc' },
    });

    const res = await request(app.getHttpServer())
      .get('/cards/public-token-abc')
      .expect(200);

    // A vacina do tutor aparece, o comprovante não: é dado de saúde e exige login.
    expect(res.body.vaccines).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain('anexos');
    expect(JSON.stringify(res.body)).not.toContain('carteirinha.pdf');
  });

  it('o banco recusa anexo sem registro ou com dois registros (CHECK)', async () => {
    const dados = {
      petId,
      s3Key: 'anexos/x/1.pdf',
      nomeArquivo: 'x.pdf',
      mimeType: 'application/pdf',
      tamanhoBytes: 1,
      sha256: 'h',
      enviadoPorTipo: 'TUTOR' as const,
      enviadoPorId: 't',
      enviadoPorNome: 'T',
    };
    await expect(prisma.anexoClinico.create({ data: dados })).rejects.toThrow();

    const verm = await prisma.dewormingRecord.create({
      data: { petId, productName: 'Drontal', appliedAt: new Date() },
    });
    await expect(
      prisma.anexoClinico.create({
        data: {
          ...dados,
          s3Key: 'anexos/x/2.pdf',
          vaccineRecordId: vacinaId,
          dewormingRecordId: verm.id,
        },
      }),
    ).rejects.toThrow();
  });
});
