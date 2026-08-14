/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { EncryptionService } from '../../../common/crypto/encryption.service';
import { GoogleCalendarService } from '../google-calendar.service';

const mockOAuth2Instance = {
  generateAuthUrl: jest.fn(),
  getToken: jest.fn(),
  setCredentials: jest.fn(),
  on: jest.fn(),
};
const mockCalendarEvents = {
  insert: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};
const mockOAuth2Ctor = jest.fn(() => mockOAuth2Instance);
const mockCalendarFactory = jest.fn(() => ({ events: mockCalendarEvents }));

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: function (...args: unknown[]) {
        return mockOAuth2Ctor(...args);
      },
    },
    calendar: (...args: unknown[]) => mockCalendarFactory(...args),
  },
}));

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

const makeConfig = (configured = true): ConfigService =>
  ({
    get: (key: string) =>
      (
        ({
          'googleCalendar.clientId': configured ? 'client-id' : '',
          'googleCalendar.clientSecret': configured ? 'secret' : '',
          'googleCalendar.redirectUri': 'http://localhost/callback',
        }) as Record<string, string>
      )[key],
  }) as unknown as ConfigService;

describe('GoogleCalendarService', () => {
  let service: GoogleCalendarService;
  let prisma: {
    googleOAuthToken: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      deleteMany: jest.Mock;
      update: jest.Mock;
    };
    appointment: {
      update: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
    };
    tutor: { findUnique: jest.Mock };
  };
  let encryption: {
    encrypt: jest.Mock;
    decrypt: jest.Mock;
    assertConfigured: jest.Mock;
  };

  const tokenRow = {
    tutorId: 'tutor-1',
    accessToken: 'enc-access',
    refreshToken: 'enc-refresh',
    expiresAt: new Date('2026-07-01T00:00:00Z'),
    scopes: SCOPES,
  };

  const eventInput = {
    title: 'Consulta',
    description: 'Check-up',
    startTime: new Date('2026-06-01T14:00:00Z'),
    durationMinutes: 30,
    location: 'Clínica VetCare',
  };

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      googleOAuthToken: {
        upsert: jest.fn().mockResolvedValue(undefined),
        findUnique: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
      },
      appointment: {
        update: jest.fn().mockResolvedValue(undefined),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      tutor: { findUnique: jest.fn() },
    };
    encryption = {
      encrypt: jest.fn((v: string) => `enc(${v})`),
      decrypt: jest.fn((v: string) => `dec(${v})`),
      assertConfigured: jest.fn(),
    };
    mockOAuth2Instance.generateAuthUrl.mockReturnValue(
      'https://accounts.google.com/o/oauth2/auth?xyz',
    );
    service = new GoogleCalendarService(
      makeConfig(true),
      prisma as unknown as PrismaService,
      encryption as unknown as EncryptionService,
    );
  });

  describe('getAuthUrl', () => {
    it('gera a URL de consentimento offline com o tutorId no state', () => {
      const url = service.getAuthUrl('tutor-1');

      expect(url).toBe('https://accounts.google.com/o/oauth2/auth?xyz');
      expect(mockOAuth2Instance.generateAuthUrl).toHaveBeenCalledWith({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
        state: 'tutor-1',
      });
    });

    it('retorna null quando o Google Calendar não está configurado', () => {
      const unconfigured = new GoogleCalendarService(
        makeConfig(false),
        prisma as unknown as PrismaService,
        encryption as unknown as EncryptionService,
      );

      expect(unconfigured.getAuthUrl('tutor-1')).toBeNull();
      expect(mockOAuth2Instance.generateAuthUrl).not.toHaveBeenCalled();
    });
  });

  describe('handleCallback', () => {
    it('cifra e persiste os tokens recebidos do Google', async () => {
      mockOAuth2Instance.getToken.mockResolvedValue({
        tokens: {
          access_token: 'at-raw',
          refresh_token: 'rt-raw',
          expiry_date: 1_800_000_000_000,
        },
      });

      await service.handleCallback('auth-code', 'tutor-1');

      expect(mockOAuth2Instance.getToken).toHaveBeenCalledWith('auth-code');
      expect(encryption.encrypt).toHaveBeenCalledWith('at-raw');
      expect(encryption.encrypt).toHaveBeenCalledWith('rt-raw');

      const arg = prisma.googleOAuthToken.upsert.mock.calls[0][0];
      expect(arg.where).toEqual({ tutorId: 'tutor-1' });
      expect(arg.create.accessToken).toBe('enc(at-raw)');
      expect(arg.create.refreshToken).toBe('enc(rt-raw)');
      expect(arg.update.accessToken).toBe('enc(at-raw)');
      expect(arg.update.expiresAt).toBeInstanceOf(Date);
    });

    it('não re-cifra refresh token ausente no update', async () => {
      // Reconexão: o Google só manda refresh_token no primeiro consentimento.
      prisma.googleOAuthToken.findUnique.mockResolvedValue({
        refreshToken: 'enc(rt-antigo)',
      });
      mockOAuth2Instance.getToken.mockResolvedValue({
        tokens: {
          access_token: 'at-raw',
          refresh_token: undefined,
          expiry_date: 1_800_000_000_000,
        },
      });

      await service.handleCallback('auth-code', 'tutor-1');

      const arg = prisma.googleOAuthToken.upsert.mock.calls[0][0];
      expect(arg.update.refreshToken).toBeUndefined();
      // O create precisa de um valor: reaproveita o que já estava salvo.
      expect(arg.create.refreshToken).toBe('enc(rt-antigo)');
    });

    it('falha com orientação quando não há refresh token novo nem salvo', async () => {
      prisma.googleOAuthToken.findUnique.mockResolvedValue(null);
      mockOAuth2Instance.getToken.mockResolvedValue({
        tokens: {
          access_token: 'at-raw',
          refresh_token: undefined,
          expiry_date: 1_800_000_000_000,
        },
      });

      await expect(
        service.handleCallback('auth-code', 'tutor-1'),
      ).rejects.toThrow(/refresh token/i);
      expect(prisma.googleOAuthToken.upsert).not.toHaveBeenCalled();
    });

    it('falha quando o Google não devolve access token', async () => {
      mockOAuth2Instance.getToken.mockResolvedValue({
        tokens: { access_token: undefined, refresh_token: 'rt-raw' },
      });

      await expect(
        service.handleCallback('auth-code', 'tutor-1'),
      ).rejects.toThrow(/access token/i);
      expect(prisma.googleOAuthToken.upsert).not.toHaveBeenCalled();
    });

    it('assume validade padrão quando o Google omite expiry_date', async () => {
      mockOAuth2Instance.getToken.mockResolvedValue({
        tokens: {
          access_token: 'at-raw',
          refresh_token: 'rt-raw',
          expiry_date: undefined,
        },
      });

      await service.handleCallback('auth-code', 'tutor-1');

      const arg = prisma.googleOAuthToken.upsert.mock.calls[0][0];
      const expiresAt = arg.create.expiresAt as Date;
      expect(expiresAt).toBeInstanceOf(Date);
      expect(Number.isNaN(expiresAt.getTime())).toBe(false);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('valida a chave de criptografia antes de gastar o código do Google', async () => {
      encryption.assertConfigured.mockImplementation(() => {
        throw new Error('ENCRYPTION_KEY é obrigatória');
      });

      await expect(
        service.handleCallback('auth-code', 'tutor-1'),
      ).rejects.toThrow(/ENCRYPTION_KEY/);
      expect(mockOAuth2Instance.getToken).not.toHaveBeenCalled();
    });

    it('recusa o callback quando a integração não está configurada', async () => {
      const unconfigured = new GoogleCalendarService(
        makeConfig(false),
        prisma as unknown as PrismaService,
        encryption as unknown as EncryptionService,
      );

      await expect(
        unconfigured.handleCallback('auth-code', 'tutor-1'),
      ).rejects.toThrow(/não está configurada/i);
      expect(mockOAuth2Instance.getToken).not.toHaveBeenCalled();
    });
  });

  describe('isConnected / disconnect', () => {
    it('isConnected retorna true quando há token salvo', async () => {
      prisma.googleOAuthToken.findUnique.mockResolvedValue(tokenRow);
      await expect(service.isConnected('tutor-1')).resolves.toBe(true);
    });

    it('isConnected retorna false quando não há token', async () => {
      prisma.googleOAuthToken.findUnique.mockResolvedValue(null);
      await expect(service.isConnected('tutor-1')).resolves.toBe(false);
    });

    it('disconnect remove os tokens do tutor', async () => {
      await service.disconnect('tutor-1');
      expect(prisma.googleOAuthToken.deleteMany).toHaveBeenCalledWith({
        where: { tutorId: 'tutor-1' },
      });
    });
  });

  describe('createEvent', () => {
    it('não faz nada quando o tutor não conectou o Google', async () => {
      prisma.googleOAuthToken.findUnique.mockResolvedValue(null);

      await service.createEvent('tutor-1', 'appt-1', eventInput);

      expect(mockCalendarEvents.insert).not.toHaveBeenCalled();
      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('insere o evento, usa o timezone do tutor e marca SYNCED', async () => {
      prisma.googleOAuthToken.findUnique.mockResolvedValue(tokenRow);
      prisma.tutor.findUnique.mockResolvedValue({
        timezone: 'America/Sao_Paulo',
      });
      mockCalendarEvents.insert.mockResolvedValue({
        data: { id: 'evt-1', etag: 'etag-1' },
      });

      await service.createEvent('tutor-1', 'appt-1', eventInput);

      const insertArg = mockCalendarEvents.insert.mock.calls[0][0];
      expect(insertArg.calendarId).toBe('primary');
      expect(insertArg.requestBody.summary).toBe('Consulta');
      expect(insertArg.requestBody.start.timeZone).toBe('America/Sao_Paulo');
      expect(insertArg.requestBody.start.dateTime).toBe(
        '2026-06-01T14:00:00.000Z',
      );
      expect(insertArg.requestBody.end.dateTime).toBe(
        '2026-06-01T14:30:00.000Z',
      );
      expect(insertArg.requestBody.reminders.overrides).toHaveLength(2);

      const updateArg = prisma.appointment.update.mock.calls[0][0];
      expect(updateArg.where).toEqual({ id: 'appt-1' });
      expect(updateArg.data).toMatchObject({
        googleEventId: 'evt-1',
        googleEtag: 'etag-1',
        syncStatus: 'SYNCED',
        syncError: null,
      });
    });

    it('usa America/Fortaleza como timezone padrão', async () => {
      prisma.googleOAuthToken.findUnique.mockResolvedValue(tokenRow);
      prisma.tutor.findUnique.mockResolvedValue(null);
      mockCalendarEvents.insert.mockResolvedValue({
        data: { id: 'evt-1', etag: 'etag-1' },
      });

      await service.createEvent('tutor-1', 'appt-1', eventInput);

      const insertArg = mockCalendarEvents.insert.mock.calls[0][0];
      expect(insertArg.requestBody.start.timeZone).toBe('America/Fortaleza');
    });

    it('marca FAILED e propaga o erro quando o insert falha', async () => {
      prisma.googleOAuthToken.findUnique.mockResolvedValue(tokenRow);
      prisma.tutor.findUnique.mockResolvedValue(null);
      mockCalendarEvents.insert.mockRejectedValue(new Error('quota exceeded'));

      await expect(
        service.createEvent('tutor-1', 'appt-1', eventInput),
      ).rejects.toThrow('quota exceeded');

      const updateArg = prisma.appointment.update.mock.calls[0][0];
      expect(updateArg.data).toMatchObject({
        syncStatus: 'FAILED',
        syncError: 'quota exceeded',
      });
    });
  });

  describe('updateEvent', () => {
    it('não faz nada quando o agendamento não tem googleEventId', async () => {
      prisma.appointment.findUnique.mockResolvedValue({ googleEventId: null });

      await service.updateEvent('tutor-1', 'appt-1', eventInput);

      expect(prisma.googleOAuthToken.findUnique).not.toHaveBeenCalled();
      expect(mockCalendarEvents.update).not.toHaveBeenCalled();
    });

    it('não faz nada quando o tutor desconectou o Google', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        googleEventId: 'evt-1',
      });
      prisma.googleOAuthToken.findUnique.mockResolvedValue(null);

      await service.updateEvent('tutor-1', 'appt-1', eventInput);

      expect(mockCalendarEvents.update).not.toHaveBeenCalled();
    });

    it('atualiza o evento existente e marca SYNCED', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        googleEventId: 'evt-1',
      });
      prisma.googleOAuthToken.findUnique.mockResolvedValue(tokenRow);
      prisma.tutor.findUnique.mockResolvedValue(null);
      mockCalendarEvents.update.mockResolvedValue({
        data: { etag: 'etag-2' },
      });

      await service.updateEvent('tutor-1', 'appt-1', eventInput);

      const updateArg = mockCalendarEvents.update.mock.calls[0][0];
      expect(updateArg.eventId).toBe('evt-1');
      expect(updateArg.requestBody.summary).toBe('Consulta');

      const apptArg = prisma.appointment.update.mock.calls[0][0];
      expect(apptArg.data).toMatchObject({
        googleEtag: 'etag-2',
        syncStatus: 'SYNCED',
        syncError: null,
      });
    });

    it('marca FAILED e propaga o erro quando o update falha', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        googleEventId: 'evt-1',
      });
      prisma.googleOAuthToken.findUnique.mockResolvedValue(tokenRow);
      prisma.tutor.findUnique.mockResolvedValue(null);
      mockCalendarEvents.update.mockRejectedValue(new Error('conflict'));

      await expect(
        service.updateEvent('tutor-1', 'appt-1', eventInput),
      ).rejects.toThrow('conflict');

      const apptArg = prisma.appointment.update.mock.calls[0][0];
      expect(apptArg.data).toMatchObject({
        syncStatus: 'FAILED',
        syncError: 'conflict',
      });
    });
  });

  describe('deleteEvent', () => {
    it('não faz nada quando o tutor não está conectado', async () => {
      prisma.googleOAuthToken.findUnique.mockResolvedValue(null);

      await service.deleteEvent('tutor-1', 'evt-1');

      expect(mockCalendarEvents.delete).not.toHaveBeenCalled();
    });

    it('remove o evento do Google Calendar', async () => {
      prisma.googleOAuthToken.findUnique.mockResolvedValue(tokenRow);
      mockCalendarEvents.delete.mockResolvedValue(undefined);

      await service.deleteEvent('tutor-1', 'evt-1');

      expect(mockCalendarEvents.delete).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'evt-1',
      });
    });

    it('propaga o erro quando o delete falha', async () => {
      prisma.googleOAuthToken.findUnique.mockResolvedValue(tokenRow);
      mockCalendarEvents.delete.mockRejectedValue(new Error('boom'));

      await expect(service.deleteEvent('tutor-1', 'evt-1')).rejects.toThrow(
        'boom',
      );
    });

    it.each([
      ['410 (evento já apagado)', 410, 'Resource has been deleted'],
      ['404 (evento inexistente)', 404, 'Not Found'],
    ])('trata %s como sucesso — apagar é idempotente', async (_, code, msg) => {
      prisma.googleOAuthToken.findUnique.mockResolvedValue(tokenRow);
      mockCalendarEvents.delete.mockRejectedValue(
        Object.assign(new Error(msg), { code }),
      );

      await expect(
        service.deleteEvent('tutor-1', 'evt-1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('syncAppointment', () => {
    it('não faz nada quando o agendamento não existe', async () => {
      prisma.appointment.findUnique.mockResolvedValue(null);

      await service.syncAppointment('tutor-1', 'appt-1');

      expect(mockCalendarEvents.insert).not.toHaveBeenCalled();
      expect(mockCalendarEvents.update).not.toHaveBeenCalled();
    });

    it('cria o evento quando ainda não há googleEventId', async () => {
      prisma.appointment.findUnique
        .mockResolvedValueOnce({
          title: 'Consulta',
          description: null,
          scheduledAt: eventInput.startTime,
          durationMinutes: 30,
          location: null,
          googleEventId: null,
          pet: { name: 'Rex' },
        })
        .mockResolvedValue({ googleEventId: null });
      prisma.googleOAuthToken.findUnique.mockResolvedValue(tokenRow);
      prisma.tutor.findUnique.mockResolvedValue(null);
      mockCalendarEvents.insert.mockResolvedValue({
        data: { id: 'evt-1', etag: 'etag-1' },
      });

      await service.syncAppointment('tutor-1', 'appt-1');

      expect(mockCalendarEvents.insert).toHaveBeenCalled();
      expect(mockCalendarEvents.update).not.toHaveBeenCalled();
    });

    it('atualiza o evento quando já existe googleEventId', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        title: 'Consulta',
        description: null,
        scheduledAt: eventInput.startTime,
        durationMinutes: 30,
        location: null,
        googleEventId: 'evt-1',
        pet: { name: 'Rex' },
      });
      prisma.googleOAuthToken.findUnique.mockResolvedValue(tokenRow);
      prisma.tutor.findUnique.mockResolvedValue(null);
      mockCalendarEvents.update.mockResolvedValue({ data: { etag: 'etag-2' } });

      await service.syncAppointment('tutor-1', 'appt-1');

      expect(mockCalendarEvents.update).toHaveBeenCalled();
      expect(mockCalendarEvents.insert).not.toHaveBeenCalled();
    });
  });

  describe('syncAllPending', () => {
    it('retorna 0 e não busca pendências quando não está conectado', async () => {
      prisma.googleOAuthToken.findUnique.mockResolvedValue(null);

      const count = await service.syncAllPending('tutor-1');

      expect(count).toBe(0);
      expect(prisma.appointment.findMany).not.toHaveBeenCalled();
    });

    it('sincroniza todas as pendências e retorna a contagem', async () => {
      prisma.googleOAuthToken.findUnique.mockResolvedValue(tokenRow);
      prisma.appointment.findMany.mockResolvedValue([
        { id: 'appt-1' },
        { id: 'appt-2' },
      ]);
      // syncAppointment busca cada appointment; sem googleEventId → createEvent
      prisma.appointment.findUnique.mockResolvedValue({
        title: 'Consulta',
        description: null,
        scheduledAt: eventInput.startTime,
        durationMinutes: 30,
        location: null,
        googleEventId: null,
        pet: { name: 'Rex' },
      });
      prisma.tutor.findUnique.mockResolvedValue(null);
      mockCalendarEvents.insert.mockResolvedValue({
        data: { id: 'evt-1', etag: 'etag-1' },
      });

      const count = await service.syncAllPending('tutor-1');

      expect(count).toBe(2);
      expect(mockCalendarEvents.insert).toHaveBeenCalledTimes(2);
    });

    it('continua o lote quando uma sincronização falha', async () => {
      prisma.googleOAuthToken.findUnique.mockResolvedValue(tokenRow);
      prisma.appointment.findMany.mockResolvedValue([
        { id: 'appt-1' },
        { id: 'appt-2' },
      ]);
      prisma.appointment.findUnique.mockResolvedValue({
        title: 'Consulta',
        description: null,
        scheduledAt: eventInput.startTime,
        durationMinutes: 30,
        location: null,
        googleEventId: null,
        pet: { name: 'Rex' },
      });
      prisma.tutor.findUnique.mockResolvedValue(null);
      mockCalendarEvents.insert.mockRejectedValue(new Error('falha'));

      const count = await service.syncAllPending('tutor-1');

      expect(count).toBe(2);
      expect(mockCalendarEvents.insert).toHaveBeenCalledTimes(2);
    });
  });

  describe('getCalendarClient (refresh de token)', () => {
    it('decifra os tokens e re-cifra ao receber novos tokens', async () => {
      let tokensCallback: (t: Record<string, unknown>) => void = () => {};
      mockOAuth2Instance.on.mockImplementation(
        (_event: string, cb: (t: Record<string, unknown>) => void) => {
          tokensCallback = cb;
        },
      );
      prisma.googleOAuthToken.findUnique.mockResolvedValue(tokenRow);
      prisma.tutor.findUnique.mockResolvedValue(null);
      mockCalendarEvents.insert.mockResolvedValue({
        data: { id: 'evt-1', etag: 'etag-1' },
      });

      await service.createEvent('tutor-1', 'appt-1', eventInput);

      expect(mockOAuth2Instance.setCredentials).toHaveBeenCalledWith({
        access_token: 'dec(enc-access)',
        refresh_token: 'dec(enc-refresh)',
        expiry_date: tokenRow.expiresAt.getTime(),
      });

      // novo access_token → re-cifra
      tokensCallback({
        access_token: 'novo-at',
        expiry_date: 1_900_000_000_000,
      });
      let updArg = prisma.googleOAuthToken.update.mock.calls[0][0];
      expect(updArg.data.accessToken).toBe('enc(novo-at)');
      expect(updArg.data.expiresAt).toBeInstanceOf(Date);

      // sem novo access_token/expiry → mantém os valores cifrados atuais
      tokensCallback({});
      updArg = prisma.googleOAuthToken.update.mock.calls[1][0];
      expect(updArg.data.accessToken).toBe('enc-access');
      expect(updArg.data.expiresAt).toBe(tokenRow.expiresAt);
    });
  });
});
