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
    loginVeterinario: jest.Mock;
    getVeterinarioProfile: jest.Mock;
  };

  beforeAll(async () => {
    auth = {
      register: jest.fn(),
      login: jest.fn(),
      loginVeterinario: jest.fn(),
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
          password: 'senha123',
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
