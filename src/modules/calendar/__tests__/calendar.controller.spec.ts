/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import {
  createControllerTestApp,
  ControllerHarness,
  TUTOR,
  VET,
} from '../../../../test/utils/controller-harness';
import { CalendarController } from '../calendar.controller';
import { GoogleCalendarService } from '../google-calendar.service';

describe('CalendarController (integração)', () => {
  let harness: ControllerHarness;
  let calendar: {
    getAuthUrl: jest.Mock;
    resolveState: jest.Mock;
    handleCallback: jest.Mock;
    isConnected: jest.Mock;
    disconnect: jest.Mock;
    syncAllPending: jest.Mock;
  };
  let nodeEnv: string;

  beforeAll(async () => {
    calendar = {
      getAuthUrl: jest.fn(),
      resolveState: jest.fn().mockReturnValue('tutor-1'),
      handleCallback: jest.fn().mockResolvedValue(undefined),
      isConnected: jest.fn(),
      disconnect: jest.fn().mockResolvedValue(undefined),
      syncAllPending: jest.fn(),
    };

    harness = await createControllerTestApp({
      controllers: [CalendarController],
      providers: [
        { provide: GoogleCalendarService, useValue: calendar },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === 'NODE_ENV' ? nodeEnv : undefined),
          },
        },
      ],
    });
  });

  afterAll(async () => {
    await harness.app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    harness.setUser(TUTOR);
    nodeEnv = 'test';
  });

  describe('GET /calendar/connect', () => {
    it('retorna a auth_url quando a integração está configurada (200)', async () => {
      calendar.getAuthUrl.mockReturnValue('https://accounts.google.com/auth');

      const res = await request(harness.app.getHttpServer())
        .get('/calendar/connect')
        .expect(200);

      expect(res.body.auth_url).toBe('https://accounts.google.com/auth');
    });

    it('retorna connected=false quando não configurada (200)', async () => {
      calendar.getAuthUrl.mockReturnValue(null);

      const res = await request(harness.app.getHttpServer())
        .get('/calendar/connect')
        .expect(200);

      expect(res.body.connected).toBe(false);
    });

    it('proíbe VET (403)', async () => {
      harness.setUser(VET);

      await request(harness.app.getHttpServer())
        .get('/calendar/connect')
        .expect(403);
    });
  });

  describe('GET /calendar/callback', () => {
    it('processa o code e responde HTML (rota pública)', async () => {
      harness.setUser(null); // callback não tem @Auth

      const res = await request(harness.app.getHttpServer())
        .get('/calendar/callback?code=abc&state=state-assinado')
        .expect(200);

      expect(res.text).toContain('conectado com sucesso');
      expect(calendar.resolveState).toHaveBeenCalledWith('state-assinado');
      expect(calendar.handleCallback).toHaveBeenCalledWith('abc', 'tutor-1');
    });

    it('recusa state que não passa na verificação (400)', async () => {
      // O state deixou de ser o id do tutor em texto puro: sem assinatura
      // válida o callback não troca o code nem toca no banco.
      harness.setUser(null);
      calendar.resolveState.mockImplementationOnce(() => {
        throw new BadRequestException('Parâmetro state inválido.');
      });

      const res = await request(harness.app.getHttpServer())
        .get('/calendar/callback?code=abc&state=forjado')
        .expect(400);

      expect(res.text).toContain('Link inválido');
      expect(calendar.handleCallback).not.toHaveBeenCalled();
    });

    it('responde 400 em página quando o usuário nega o consentimento', async () => {
      harness.setUser(null);

      const res = await request(harness.app.getHttpServer())
        .get('/calendar/callback?error=access_denied&state=tutor-1')
        .expect(400);

      expect(res.text).toContain('Autorização não concluída');
      expect(calendar.handleCallback).not.toHaveBeenCalled();
    });

    it('responde 400 em página quando faltam code ou state', async () => {
      harness.setUser(null);

      const res = await request(harness.app.getHttpServer())
        .get('/calendar/callback?code=abc')
        .expect(400);

      expect(res.text).toContain('Link inválido');
      expect(calendar.handleCallback).not.toHaveBeenCalled();
    });

    it('converte falha do serviço em página de erro genérica', async () => {
      // A mensagem do erro fica no log. A página é pública e a mensagem
      // carrega detalhe de configuração do servidor.
      harness.setUser(null);
      calendar.handleCallback.mockRejectedValue(
        new Error(
          'ENCRYPTION_KEY é obrigatória para cifrar/decifrar tokens OAuth.',
        ),
      );

      const res = await request(harness.app.getHttpServer())
        .get('/calendar/callback?code=abc&state=state-assinado')
        .expect(500);

      expect(res.text).toContain('Não foi possível conectar');
      expect(res.text).not.toContain('ENCRYPTION_KEY');
      expect(res.text).not.toContain('at GoogleCalendarService');
    });
  });

  describe('GET /calendar/dev-connect', () => {
    it('retorna 404 fora de development', async () => {
      harness.setUser(null);
      nodeEnv = 'production';

      await request(harness.app.getHttpServer())
        .get('/calendar/dev-connect')
        .expect(404);
    });

    it('serve a página em development (200)', async () => {
      harness.setUser(null);
      nodeEnv = 'development';

      const res = await request(harness.app.getHttpServer())
        .get('/calendar/dev-connect')
        .expect(200);

      expect(res.text).toContain('Dev Connect');
    });
  });

  describe('GET /calendar/status', () => {
    it('retorna o estado de conexão (200)', async () => {
      calendar.isConnected.mockResolvedValue(true);

      const res = await request(harness.app.getHttpServer())
        .get('/calendar/status')
        .expect(200);

      expect(res.body.connected).toBe(true);
    });
  });

  describe('DELETE /calendar/disconnect', () => {
    it('desconecta o tutor (204)', async () => {
      await request(harness.app.getHttpServer())
        .delete('/calendar/disconnect')
        .expect(204);

      expect(calendar.disconnect).toHaveBeenCalledWith('tutor-1');
    });
  });

  describe('POST /calendar/sync', () => {
    it('sincroniza pendências e retorna a contagem (201)', async () => {
      calendar.syncAllPending.mockResolvedValue(3);

      const res = await request(harness.app.getHttpServer())
        .post('/calendar/sync')
        .expect(201);

      expect(res.body.synced).toBe(3);
    });
  });
});
