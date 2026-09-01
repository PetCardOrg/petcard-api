/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import request from 'supertest';
import {
  createControllerTestApp,
  ControllerHarness,
  TUTOR,
  VET,
} from '../../../../test/utils/controller-harness';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';

describe('AuthController (integração)', () => {
  let harness: ControllerHarness;
  let auth: {
    register: jest.Mock;
    login: jest.Mock;
    googleLogin: jest.Mock;
    forgotPassword: jest.Mock;
    resetPassword: jest.Mock;
    verifyEmail: jest.Mock;
    resendVerification: jest.Mock;
    loginVeterinario: jest.Mock;
    registerVeterinario: jest.Mock;
    getVeterinarioProfile: jest.Mock;
  };

  beforeAll(async () => {
    auth = {
      register: jest.fn(),
      login: jest.fn(),
      googleLogin: jest.fn(),
      forgotPassword: jest.fn().mockResolvedValue(undefined),
      resetPassword: jest.fn().mockResolvedValue(undefined),
      verifyEmail: jest.fn().mockResolvedValue(undefined),
      resendVerification: jest.fn().mockResolvedValue(undefined),
      loginVeterinario: jest.fn(),
      registerVeterinario: jest.fn(),
      getVeterinarioProfile: jest.fn(),
    };

    harness = await createControllerTestApp({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: auth }],
    });
  });

  afterAll(async () => {
    await harness.app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    harness.setUser(TUTOR);
  });

  describe('POST /auth/register', () => {
    it('registra um tutor (201)', async () => {
      auth.register.mockResolvedValue({ access_token: 'jwt' });

      const res = await request(harness.app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Alice',
          email: 'alice@petcard.com',
          password: 'Senha123!',
        })
        .expect(201);

      expect(res.body.access_token).toBe('jwt');
    });

    it('rejeita senha curta (400)', async () => {
      await request(harness.app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Alice', email: 'alice@petcard.com', password: '123' })
        .expect(400);

      expect(auth.register).not.toHaveBeenCalled();
    });

    it('rejeita senha sem maiúscula/número/símbolo (400)', async () => {
      await request(harness.app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Alice',
          email: 'alice@petcard.com',
          password: 'senhasenha',
        })
        .expect(400);

      expect(auth.register).not.toHaveBeenCalled();
    });
  });

  describe('rotas de senha e verificação', () => {
    it('POST /auth/password/forgot responde 202 sem sessão', async () => {
      harness.setUser(null);

      await request(harness.app.getHttpServer())
        .post('/auth/password/forgot')
        .send({ email: 'alice@petcard.com' })
        .expect(202);

      expect(auth.forgotPassword).toHaveBeenCalledWith({
        email: 'alice@petcard.com',
      });
    });

    it('POST /auth/password/reset exige senha forte (400)', async () => {
      harness.setUser(null);

      await request(harness.app.getHttpServer())
        .post('/auth/password/reset')
        .send({ token: 'abc', password: 'fraca' })
        .expect(400);

      expect(auth.resetPassword).not.toHaveBeenCalled();
    });

    it('POST /auth/password/reset conclui com token + senha forte (204)', async () => {
      harness.setUser(null);

      await request(harness.app.getHttpServer())
        .post('/auth/password/reset')
        .send({ token: 'abc', password: 'Nova123!' })
        .expect(204);

      expect(auth.resetPassword).toHaveBeenCalled();
    });

    it('POST /auth/email/verify responde 204 sem sessão', async () => {
      harness.setUser(null);

      await request(harness.app.getHttpServer())
        .post('/auth/email/verify')
        .send({ token: 'abc' })
        .expect(204);

      expect(auth.verifyEmail).toHaveBeenCalledWith({ token: 'abc' });
    });

    it('POST /auth/email/resend exige autenticação (401)', async () => {
      harness.setUser(null);

      await request(harness.app.getHttpServer())
        .post('/auth/email/resend')
        .expect(401);

      expect(auth.resendVerification).not.toHaveBeenCalled();
    });

    it('POST /auth/email/resend usa o tutor do token (202)', async () => {
      harness.setUser(TUTOR);

      await request(harness.app.getHttpServer())
        .post('/auth/email/resend')
        .expect(202);

      expect(auth.resendVerification).toHaveBeenCalledWith('tutor-1');
    });
  });

  describe('POST /auth/google', () => {
    it('delega o ID token ao serviço (201)', async () => {
      harness.setUser(null);
      auth.googleLogin.mockResolvedValue({ access_token: 'jwt-google' });

      const res = await request(harness.app.getHttpServer())
        .post('/auth/google')
        .send({ idToken: 'id-token' })
        .expect(201);

      expect(res.body.access_token).toBe('jwt-google');
      expect(auth.googleLogin).toHaveBeenCalledWith({ idToken: 'id-token' });
    });

    it('rejeita corpo sem idToken (400)', async () => {
      harness.setUser(null);

      await request(harness.app.getHttpServer())
        .post('/auth/google')
        .send({})
        .expect(400);

      expect(auth.googleLogin).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/login', () => {
    it('autentica com credenciais válidas (201)', async () => {
      auth.login.mockResolvedValue({ access_token: 'jwt' });

      const res = await request(harness.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'alice@petcard.com', password: 'senha123' })
        .expect(201);

      expect(res.body.access_token).toBe('jwt');
    });

    it('rejeita email inválido (400)', async () => {
      await request(harness.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nao-email', password: 'x' })
        .expect(400);
    });
  });

  describe('GET /auth/profile', () => {
    it('retorna o usuário autenticado (200)', async () => {
      const res = await request(harness.app.getHttpServer())
        .get('/auth/profile')
        .expect(200);

      expect(res.body.sub).toBe('tutor-1');
    });

    it('exige autenticação (401)', async () => {
      harness.setUser(null);

      await request(harness.app.getHttpServer())
        .get('/auth/profile')
        .expect(401);
    });
  });

  describe('Veterinário', () => {
    it('POST /auth/veterinario/register cadastra sem autenticação (201)', async () => {
      auth.registerVeterinario.mockResolvedValue({
        access_token: 'jwt-vet',
        crmv_verificado: true,
      });

      const res = await request(harness.app.getHttpServer())
        .post('/auth/veterinario/register')
        .send({
          nome: 'Dr. Carlos',
          email: 'carlos@vet.com',
          password: 'senha-forte',
          crmv: 'CRMV-SP 12345',
        })
        .expect(201);

      expect(res.body.access_token).toBe('jwt-vet');
      expect(res.body.crmv_verificado).toBe(true);
    });

    it('POST /auth/veterinario/register rejeita payload inválido (400)', async () => {
      await request(harness.app.getHttpServer())
        .post('/auth/veterinario/register')
        .send({ nome: 'Dr. Carlos' })
        .expect(400);

      expect(auth.registerVeterinario).not.toHaveBeenCalled();
    });

    it('POST /auth/veterinario/login autentica (201)', async () => {
      auth.loginVeterinario.mockResolvedValue({ access_token: 'jwt-vet' });

      const res = await request(harness.app.getHttpServer())
        .post('/auth/veterinario/login')
        .send({ email: 'vet@petcard.com', password: 'senha123' })
        .expect(201);

      expect(res.body.access_token).toBe('jwt-vet');
    });

    it('GET /auth/veterinario/profile retorna o perfil do VET (200)', async () => {
      harness.setUser(VET);
      auth.getVeterinarioProfile.mockResolvedValue({ id: 'vet-1' });

      const res = await request(harness.app.getHttpServer())
        .get('/auth/veterinario/profile')
        .expect(200);

      expect(res.body.id).toBe('vet-1');
    });

    it('GET /auth/veterinario/profile proíbe TUTOR (403)', async () => {
      harness.setUser(TUTOR);

      await request(harness.app.getHttpServer())
        .get('/auth/veterinario/profile')
        .expect(403);
    });
  });
});
