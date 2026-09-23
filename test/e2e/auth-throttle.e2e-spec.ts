import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { App } from 'supertest/types';
import request from 'supertest';
import { createE2EApp, E2EApp } from '../utils/e2e-app';
import { resetDb } from '../utils/e2e-db';
import { PrismaService } from '../../src/prisma/prisma.service';
import { LIMITE_DE_ROTA_CARA } from '../../src/config/throttler.config';
import { Role } from '../../src/modules/auth/enums/role.enum';

const LIMITE = 3;

/**
 * Rate limit das rotas sem sessão.
 *
 * As rotas de login e cadastro eram a única superfície pública sem limite:
 * dava para varrer senhas contra `POST /auth/login` na velocidade da rede. O
 * teto real vem do ambiente, então esta suíte sobe um app próprio com um
 * limite baixo — o resto do e2e roda com teto alto para não se auto-bloquear.
 */
describe('Rate limit de autenticação (e2e)', () => {
  let ctx: E2EApp;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let limiteOriginal: string | undefined;

  beforeAll(async () => {
    limiteOriginal = process.env.AUTH_THROTTLE_LIMIT;
    // Lido no boot do módulo: precisa estar posto antes do createE2EApp.
    process.env.AUTH_THROTTLE_LIMIT = String(LIMITE);

    ctx = await createE2EApp();
    ({ app, prisma } = ctx);
    await resetDb(prisma);
  });

  afterAll(async () => {
    await app.close();
    if (limiteOriginal === undefined) delete process.env.AUTH_THROTTLE_LIMIT;
    else process.env.AUTH_THROTTLE_LIMIT = limiteOriginal;
  });

  it('corta a força bruta de senha depois do limite de tentativas', async () => {
    const tentativa = () =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'ninguem@petcard.com', password: 'chute' });

    // Credencial errada responde 401 enquanto há orçamento na janela.
    for (let i = 0; i < LIMITE; i++) {
      await tentativa().expect(401);
    }

    // Estourado o limite, o IP para de ser atendido — inclusive antes de
    // qualquer consulta ao banco.
    await tentativa().expect(429);
  });

  it('o cadastro também é limitado, com orçamento próprio', async () => {
    // O throttler conta por rota: estourar o login não fecha o cadastro. Cada
    // superfície tem o seu teto, e ambas têm um.
    const cadastro = (i: number) =>
      request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Alice',
          email: `nova${i}@petcard.com`,
          password: 'Senha123!',
        });

    for (let i = 0; i < LIMITE; i++) {
      await cadastro(i).expect(201);
    }

    await cadastro(LIMITE).expect(429);
    expect(await prisma.tutor.count()).toBe(LIMITE);
  });

  /**
   * Rotas com sessão que custam mais que uma tentativa de login: uma queima
   * cota de SMTP e reputação de remetente, a outra é uma consulta cobrada por
   * chamada. Ter token não é salvo-conduto para repetir à vontade.
   */
  describe('rotas caras (com sessão)', () => {
    /**
     * A conta e o token saem daqui, não dos endpoints de cadastro/login: nesta
     * suíte o orçamento deles já foi gasto pelos testes acima, e o que está
     * sob teste é o limite próprio destas rotas.
     */
    async function sessaoDeTutor(email: string): Promise<string> {
      const tutor = await prisma.tutor.create({
        data: { name: 'Tutor', email, password: 'hash-irrelevante' },
      });
      return app
        .get(JwtService)
        .sign({ sub: tutor.id, email: tutor.email, role: Role.TUTOR });
    }

    async function sessaoDeVet(email: string): Promise<string> {
      const vet = await prisma.veterinario.create({
        data: {
          nome: 'Dra. Camila',
          email,
          crmv: 'CRMV-CE-1234',
          password: 'hash-irrelevante',
          crmvVerifiedAt: new Date(),
          crmvSituacao: 'Ativo',
        },
      });
      return app
        .get(JwtService)
        .sign({ sub: vet.id, email: vet.email, role: Role.VET });
    }

    it('corta o reenvio do e-mail de verificação em laço', async () => {
      const token = await sessaoDeTutor('reenvio@petcard.com');

      const reenvio = () =>
        request(app.getHttpServer())
          .post('/auth/email/resend')
          .set('Authorization', `Bearer ${token}`);

      for (let i = 0; i < LIMITE_DE_ROTA_CARA; i++) {
        await reenvio().expect(202);
      }

      await reenvio().expect(429);
    });

    it('corta a verificação de CRMV forçada em laço', async () => {
      const token = await sessaoDeVet('crmv-limite@petcard.com');

      // Cada `force=true` pula o cache de 180 dias e vira uma consulta paga.
      const verificacao = () =>
        request(app.getHttpServer())
          .post('/veterinarios/me/crmv/verificar?force=true')
          .set('Authorization', `Bearer ${token}`);

      for (let i = 0; i < LIMITE_DE_ROTA_CARA; i++) {
        await verificacao().expect(200);
      }

      await verificacao().expect(429);
    });
  });
});
