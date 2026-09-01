import { BadRequestException } from '@nestjs/common';
import request from 'supertest';
import {
  createControllerTestApp,
  ControllerHarness,
} from '../../../../test/utils/controller-harness';
import { AuthWebController } from '../auth-web.controller';
import { AuthService } from '../auth.service';

describe('AuthWebController (páginas do e-mail)', () => {
  let harness: ControllerHarness;
  let auth: { verifyEmail: jest.Mock; resetPassword: jest.Mock };

  beforeAll(async () => {
    auth = {
      verifyEmail: jest.fn().mockResolvedValue(undefined),
      resetPassword: jest.fn().mockResolvedValue(undefined),
    };
    harness = await createControllerTestApp({
      controllers: [AuthWebController],
      providers: [{ provide: AuthService, useValue: auth }],
    });
  });

  afterAll(async () => {
    await harness.app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  const server = () => harness.app.getHttpServer();

  describe('GET /auth/verify-email', () => {
    it('confirma o e-mail e devolve uma página de sucesso', async () => {
      const res = await request(server())
        .get('/auth/verify-email')
        .query({ token: 'tok-1' })
        .expect(200);

      expect(res.headers['content-type']).toMatch(/html/);
      expect(res.text).toContain('E-mail confirmado');
      expect(auth.verifyEmail).toHaveBeenCalledWith({ token: 'tok-1' });
    });

    it('mostra página de erro quando o token é inválido', async () => {
      auth.verifyEmail.mockRejectedValueOnce(new BadRequestException('x'));

      const res = await request(server())
        .get('/auth/verify-email')
        .query({ token: 'ruim' })
        .expect(400);

      expect(res.text).toContain('inválido ou expirado');
    });
  });

  describe('GET /auth/reset-password', () => {
    it('serve o formulário de nova senha com o token embutido', async () => {
      const res = await request(server())
        .get('/auth/reset-password')
        .query({ token: 'tok-2' })
        .expect(200);

      expect(res.text).toContain('name="token" value="tok-2"');
      expect(res.text).toContain('Criar nova senha');
    });

    it('recusa sem token', async () => {
      await request(server()).get('/auth/reset-password').expect(400);
    });
  });

  describe('POST /auth/reset-password', () => {
    it('redefine a senha com dados válidos', async () => {
      const res = await request(server())
        .post('/auth/reset-password')
        .type('form')
        .send({
          token: 'tok-3',
          password: 'NovaSenha1!',
          confirm: 'NovaSenha1!',
        })
        .expect(200);

      expect(res.text).toContain('Senha alterada');
      expect(auth.resetPassword).toHaveBeenCalledWith({
        token: 'tok-3',
        password: 'NovaSenha1!',
      });
    });

    it('recusa senha fraca sem chamar o serviço', async () => {
      await request(server())
        .post('/auth/reset-password')
        .type('form')
        .send({ token: 'tok-3', password: 'fraca', confirm: 'fraca' })
        .expect(400);

      expect(auth.resetPassword).not.toHaveBeenCalled();
    });

    it('recusa quando a confirmação não bate', async () => {
      await request(server())
        .post('/auth/reset-password')
        .type('form')
        .send({ token: 'tok-3', password: 'NovaSenha1!', confirm: 'Outra1!' })
        .expect(400);

      expect(auth.resetPassword).not.toHaveBeenCalled();
    });
  });
});
