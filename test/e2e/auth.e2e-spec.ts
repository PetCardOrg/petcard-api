/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { AuthTokenPurpose } from '@prisma/client';
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
      expect(stored?.password).not.toBe('Senha123!');

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
        .send({ email: 'login@petcard.com', password: 'Senha123!' })
        .expect(201);
      expect(res.body.access_token).toEqual(expect.any(String));
    });

    it('rejeita registro com email duplicado (409)', async () => {
      await registerTutor(app, { email: 'dup@petcard.com' });

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Outra',
          email: 'dup@petcard.com',
          password: 'Senha123!',
        })
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

    it('rejeita registro com senha fraca (400) — regra de senha forte', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Alice',
          email: 'fraca@petcard.com',
          password: 'senhafraca',
        })
        .expect(400);

      expect(
        await prisma.tutor.count({ where: { email: 'fraca@petcard.com' } }),
      ).toBe(0);
    });

    it('novo cadastro nasce com email_verified=false e gera token de verificação', async () => {
      const { user } = await registerTutor(app, { email: 'verif@petcard.com' });

      expect(user.email_verified).toBe(false);
      const tokens = await prisma.authToken.findMany({
        where: {
          tutorId: user.id,
          purpose: AuthTokenPurpose.EMAIL_VERIFICATION,
        },
      });
      expect(tokens).toHaveLength(1);
    });
  });

  describe('Recuperação de senha', () => {
    it('POST /auth/password/forgot responde 202 e não vaza se a conta existe', async () => {
      await registerTutor(app, { email: 'reset@petcard.com' });

      await request(app.getHttpServer())
        .post('/auth/password/forgot')
        .send({ email: 'reset@petcard.com' })
        .expect(202);
      await request(app.getHttpServer())
        .post('/auth/password/forgot')
        .send({ email: 'ninguem@petcard.com' })
        .expect(202);

      const criados = await prisma.authToken.count({
        where: { purpose: AuthTokenPurpose.PASSWORD_RESET },
      });
      expect(criados).toBe(1);
    });

    it('redefine a senha com um token válido e o login novo passa', async () => {
      const { user } = await registerTutor(app, { email: 'troca@petcard.com' });

      // Simula o token entregue por e-mail: grava o hash e usa o valor cru.
      const rawToken = 'token-e2e-reset';
      await prisma.authToken.create({
        data: {
          tutorId: user.id,
          purpose: AuthTokenPurpose.PASSWORD_RESET,
          tokenHash: createHash('sha256').update(rawToken).digest('hex'),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      await request(app.getHttpServer())
        .post('/auth/password/reset')
        .send({ token: rawToken, password: 'NovaSenha1!' })
        .expect(204);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'troca@petcard.com', password: 'NovaSenha1!' })
        .expect(201);

      // Token de uso único: a segunda tentativa falha.
      await request(app.getHttpServer())
        .post('/auth/password/reset')
        .send({ token: rawToken, password: 'OutraSenha1!' })
        .expect(400);
    });

    it('confirma o e-mail com o token de verificação', async () => {
      const { user } = await registerTutor(app, { email: 'conf@petcard.com' });
      const rawToken = 'token-e2e-verify';
      await prisma.authToken.create({
        data: {
          tutorId: user.id,
          purpose: AuthTokenPurpose.EMAIL_VERIFICATION,
          tokenHash: createHash('sha256').update(rawToken).digest('hex'),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      await request(app.getHttpServer())
        .post('/auth/email/verify')
        .send({ token: rawToken })
        .expect(204);

      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'conf@petcard.com', password: 'Senha123!' })
        .expect(201);
      expect(login.body.user.email_verified).toBe(true);
    });

    it('derruba as sessões abertas antes da redefinição', async () => {
      const { token, user } = await registerTutor(app, {
        email: 'invadida@petcard.com',
      });

      // Token válido enquanto a senha é a mesma.
      await request(app.getHttpServer())
        .get('/tutors/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const rawToken = 'token-e2e-revoga';
      await prisma.authToken.create({
        data: {
          tutorId: user.id,
          purpose: AuthTokenPurpose.PASSWORD_RESET,
          tokenHash: createHash('sha256').update(rawToken).digest('hex'),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      await request(app.getHttpServer())
        .post('/auth/password/reset')
        .send({ token: rawToken, password: 'NovaSenha1!' })
        .expect(204);

      // Quem redefine a senha está retomando uma conta comprometida: o token
      // de quem invadiu não pode sobreviver à troca por mais 7 dias.
      await request(app.getHttpServer())
        .get('/tutors/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('o token emitido depois da redefinição continua valendo', async () => {
      // O outro lado da moeda: revogar demais tranca todo mundo para fora.
      const { user } = await registerTutor(app, {
        email: 'segue@petcard.com',
      });

      const rawToken = 'token-e2e-segue';
      await prisma.authToken.create({
        data: {
          tutorId: user.id,
          purpose: AuthTokenPurpose.PASSWORD_RESET,
          tokenHash: createHash('sha256').update(rawToken).digest('hex'),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      await request(app.getHttpServer())
        .post('/auth/password/reset')
        .send({ token: rawToken, password: 'NovaSenha1!' })
        .expect(204);

      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'segue@petcard.com', password: 'NovaSenha1!' })
        .expect(201);

      await request(app.getHttpServer())
        .get('/tutors/me')
        .set('Authorization', `Bearer ${login.body.access_token as string}`)
        .expect(200);
    });

    it('acha a conta cadastrada em caixa mista', async () => {
      // Cadastro com maiúsculas; recuperação com o mesmo endereço em
      // minúsculas. Sem forma canônica, a busca não achava ninguém e a rota
      // respondia 202 em silêncio — o e-mail nunca chegava.
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Ana Silva',
          email: 'Ana.Silva@PetCard.com',
          password: 'Senha123!',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/password/forgot')
        .send({ email: 'ana.silva@petcard.com' })
        .expect(202);

      const criados = await prisma.authToken.count({
        where: { purpose: AuthTokenPurpose.PASSWORD_RESET },
      });
      expect(criados).toBe(1);
    });

    it('entra no login com o endereço em qualquer caixa', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Ana Silva',
          email: 'ana.silva@petcard.com',
          password: 'Senha123!',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'ANA.SILVA@PetCard.com', password: 'Senha123!' })
        .expect(201);
    });
  });

  describe('Veterinário', () => {
    const novoVet = {
      nome: 'Dr. Carlos',
      email: 'carlos@vet.com',
      password: 'Senha123!',
      crmv: 'CRMV-SP 12345',
    };

    it('cadastra sem autenticação, já verificado, e acessa a área do vet', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/veterinario/register')
        .send(novoVet)
        .expect(201);

      // O stub aprova qualquer CRMV bem formado, então o cadastro já sai
      // verificado e o vet não esbarra no bloqueio da api#113.
      expect(res.body.crmv_verificado).toBe(true);
      expect(res.body.user.password).toBeUndefined();

      const profile = await request(app.getHttpServer())
        .get('/auth/veterinario/profile')
        .set('Authorization', `Bearer ${res.body.access_token as string}`)
        .expect(200);
      expect(profile.body.crmv).toBe('CRMV-SP 12345');
    });

    it('cadastra como não verificado quando o CRMV é recusado', async () => {
      // 00000 é o número reservado que o stub recusa.
      const res = await request(app.getHttpServer())
        .post('/auth/veterinario/register')
        .send({ ...novoVet, crmv: 'CRMV-SP 00000' })
        .expect(201);

      expect(res.body.crmv_verificado).toBe(false);
      expect(res.body.access_token).toBeDefined();
    });

    it('rejeita CRMV em formato irreconhecível (400)', async () => {
      await request(app.getHttpServer())
        .post('/auth/veterinario/register')
        .send({ ...novoVet, crmv: 'não é um crmv' })
        .expect(400);

      expect(await prisma.veterinario.count()).toBe(0);
    });

    it('rejeita CRMV já cadastrado (409)', async () => {
      await request(app.getHttpServer())
        .post('/auth/veterinario/register')
        .send(novoVet)
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/veterinario/register')
        .send({ ...novoVet, email: 'outro@vet.com' })
        .expect(409);
    });

    it('faz login com a conta recém-cadastrada', async () => {
      await request(app.getHttpServer())
        .post('/auth/veterinario/register')
        .send(novoVet)
        .expect(201);

      const login = await request(app.getHttpServer())
        .post('/auth/veterinario/login')
        .send({ email: novoVet.email, password: novoVet.password })
        .expect(201);

      expect(login.body.access_token).toBeDefined();
    });

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

    /**
     * Um token de veterinário vale 7 dias e a web o guarda em `localStorage`.
     * Se ele bastasse para trocar a senha, um vazamento temporário viraria
     * posse definitiva de uma conta que lê e escreve dado clínico.
     */
    describe('troca de senha do veterinário', () => {
      it('recusa a troca sem a senha atual (400)', async () => {
        const { token } = await createAndLoginVet(app, prisma, {
          password: 'SenhaVet1!',
        });

        await request(app.getHttpServer())
          .patch('/veterinarios/me')
          .set('Authorization', `Bearer ${token}`)
          .send({ password: 'NovaSenha1!' })
          .expect(400);

        // A senha antiga continua entrando: nada foi trocado.
        await request(app.getHttpServer())
          .post('/auth/veterinario/login')
          .send({ email: 'vet@petcard.com', password: 'SenhaVet1!' })
          .expect(201);
      });

      it('recusa a troca com a senha atual errada (401)', async () => {
        const { token } = await createAndLoginVet(app, prisma, {
          password: 'SenhaVet1!',
        });

        await request(app.getHttpServer())
          .patch('/veterinarios/me')
          .set('Authorization', `Bearer ${token}`)
          .send({ password: 'NovaSenha1!', senha_atual: 'chute' })
          .expect(401);
      });

      it('troca a senha com a atual correta e encerra a sessão anterior', async () => {
        const { token } = await createAndLoginVet(app, prisma, {
          password: 'SenhaVet1!',
        });

        await request(app.getHttpServer())
          .patch('/veterinarios/me')
          .set('Authorization', `Bearer ${token}`)
          .send({ password: 'NovaSenha1!', senha_atual: 'SenhaVet1!' })
          .expect(200);

        await request(app.getHttpServer())
          .post('/auth/veterinario/login')
          .send({ email: 'vet@petcard.com', password: 'NovaSenha1!' })
          .expect(201);

        // A sessão de antes da troca cai junto — inclusive a de quem trocou.
        await request(app.getHttpServer())
          .get('/auth/veterinario/profile')
          .set('Authorization', `Bearer ${token}`)
          .expect(401);
      });

      it('editar outro campo não pede senha nem derruba a sessão', async () => {
        const { token } = await createAndLoginVet(app, prisma, {
          password: 'SenhaVet1!',
        });

        await request(app.getHttpServer())
          .patch('/veterinarios/me')
          .set('Authorization', `Bearer ${token}`)
          .send({ telefone: '85988887777' })
          .expect(200);

        await request(app.getHttpServer())
          .get('/auth/veterinario/profile')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
      });
    });
  });
});
