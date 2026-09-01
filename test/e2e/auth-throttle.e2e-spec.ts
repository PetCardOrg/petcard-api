import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { createE2EApp, E2EApp } from '../utils/e2e-app';
import { resetDb } from '../utils/e2e-db';
import { PrismaService } from '../../src/prisma/prisma.service';

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
});
