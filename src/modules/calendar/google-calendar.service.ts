import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { Appointment } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { resolveTimeZone } from '../../common/time/timezone';
import { isAlreadyGoneError } from './google-api-error';

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

interface CalendarEventInput {
  title: string;
  description?: string;
  startTime: Date;
  durationMinutes: number;
  location?: string;
}

/** Validade assumida quando o Google não informa expiry_date. */
const DEFAULT_TOKEN_TTL_MS = 3_600_000;

/** Janela de vida do `state` do OAuth — tempo de dar o consentimento. */
const STATE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {
    this.clientId =
      this.configService.get<string>('googleCalendar.clientId') ?? '';
    this.clientSecret =
      this.configService.get<string>('googleCalendar.clientSecret') ?? '';
    this.redirectUri =
      this.configService.get<string>('googleCalendar.redirectUri') ?? '';
  }

  /**
   * Assina o `state` do OAuth com o id do tutor, um nonce e um prazo.
   *
   * O `state` viajava como o id do tutor em texto puro, e o callback é uma
   * rota pública: bastava chamar `/calendar/callback?code=<código do
   * atacante>&state=<id da vítima>` para pendurar a agenda do atacante na
   * conta da vítima — e passar a receber, no Google Calendar dele, todos os
   * compromissos que ela criasse. Sem assinatura o parâmetro não prova nada
   * sobre quem começou o fluxo.
   */
  private signState(tutorId: string): string {
    const nonce = randomBytes(16).toString('base64url');
    const expiresAt = Date.now() + STATE_TTL_MS;
    const payload = `${tutorId}.${nonce}.${expiresAt}`;
    return `${payload}.${this.stateSignature(payload)}`;
  }

  /**
   * Confere a assinatura e o prazo do `state` e devolve o tutor de origem.
   * Qualquer inconsistência derruba o fluxo antes de trocar o código.
   */
  resolveState(state: string): string {
    const partes = state?.split('.') ?? [];
    if (partes.length !== 4) {
      throw new BadRequestException('Parâmetro state inválido.');
    }

    const [tutorId, nonce, expiresAtRaw, assinatura] = partes;
    const esperada = this.stateSignature(`${tutorId}.${nonce}.${expiresAtRaw}`);

    const recebida = Buffer.from(assinatura);
    const referencia = Buffer.from(esperada);
    if (
      recebida.length !== referencia.length ||
      !timingSafeEqual(recebida, referencia)
    ) {
      throw new BadRequestException('Parâmetro state inválido.');
    }

    const expiresAt = Number(expiresAtRaw);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
      throw new BadRequestException(
        'A autorização expirou. Inicie a conexão pelo app novamente.',
      );
    }

    return tutorId;
  }

  private stateSignature(payload: string): string {
    const secret = this.configService.get<string>('auth.jwtSecret');
    if (!secret) {
      throw new Error(
        'JWT_SECRET é obrigatória para assinar o state do OAuth.',
      );
    }
    return createHmac('sha256', secret).update(payload).digest('base64url');
  }

  private get isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  private createOAuth2Client(): OAuth2Client {
    return new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      this.redirectUri,
    );
  }

  getAuthUrl(tutorId: string): string | null {
    if (!this.isConfigured) return null;

    const oauth2Client = this.createOAuth2Client();
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
      state: this.signState(tutorId),
    });
  }

  async handleCallback(code: string, tutorId: string): Promise<void> {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException(
        'Integração com o Google Calendar não está configurada no servidor.',
      );
    }

    // O código do Google é de uso único: valida a chave antes de trocá-lo, senão
    // o usuário precisa refazer o consentimento por uma falha de configuração.
    this.encryption.assertConfigured();

    const oauth2Client = this.createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token) {
      throw new BadGatewayException(
        'O Google não devolveu um access token para esta autorização.',
      );
    }

    // O refresh token só vem no primeiro consentimento. Numa reconexão, o Google
    // pode omiti-lo — nesse caso mantemos o que já está salvo.
    const novoRefreshToken = tokens.refresh_token
      ? this.encryption.encrypt(tokens.refresh_token)
      : undefined;

    const existente = await this.prisma.googleOAuthToken.findUnique({
      where: { tutorId },
      select: { refreshToken: true },
    });

    const refreshTokenParaCriar = novoRefreshToken ?? existente?.refreshToken;
    if (!refreshTokenParaCriar) {
      throw new BadGatewayException(
        'O Google não devolveu um refresh token. Remova o acesso do PetCard em ' +
          'myaccount.google.com/permissions e conecte novamente.',
      );
    }

    const accessToken = this.encryption.encrypt(tokens.access_token);
    const expiresAt = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + DEFAULT_TOKEN_TTL_MS);

    await this.prisma.googleOAuthToken.upsert({
      where: { tutorId },
      update: {
        accessToken,
        // undefined preserva o refresh token já salvo.
        refreshToken: novoRefreshToken,
        expiresAt,
        scopes: SCOPES,
      },
      create: {
        tutorId,
        accessToken,
        refreshToken: refreshTokenParaCriar,
        expiresAt,
        scopes: SCOPES,
      },
    });

    // Recupera o que ficou para trás enquanto não havia conexão válida. Sem
    // isso, quem reconecta depois de uma revogação nunca mais veria esses
    // agendamentos na agenda — não há mais botão de sincronizar no app.
    // Fora do caminho da resposta: a página de sucesso não espera o catch-up.
    void this.syncAllPending(tutorId).catch((error: unknown) => {
      this.logger.warn(
        `Catch-up de sincronização falhou para o tutor ${tutorId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }

  async isConnected(tutorId: string): Promise<boolean> {
    const token = await this.prisma.googleOAuthToken.findUnique({
      where: { tutorId },
    });
    return !!token;
  }

  async disconnect(tutorId: string): Promise<void> {
    await this.prisma.googleOAuthToken.deleteMany({
      where: { tutorId },
    });
  }

  async createEvent(
    tutorId: string,
    appointmentId: string,
    event: CalendarEventInput,
    timeZone?: string,
  ): Promise<void> {
    const calendar = await this.getCalendarClient(tutorId);
    if (!calendar) return;

    try {
      const endTime = new Date(
        event.startTime.getTime() + event.durationMinutes * 60_000,
      );

      // O fuso pode vir pronto de quem chama em laço (`syncAllPending`), que já
      // o buscou uma vez para o tutor inteiro.
      const tz = timeZone ?? (await this.tutorTimeZone(tutorId));

      const res = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: event.title,
          description: event.description,
          start: {
            dateTime: event.startTime.toISOString(),
            timeZone: tz,
          },
          end: {
            dateTime: endTime.toISOString(),
            timeZone: tz,
          },
          location: event.location,
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'popup', minutes: 60 },
              { method: 'popup', minutes: 15 },
            ],
          },
        },
      });

      await this.prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          googleEventId: res.data.id,
          googleEtag: res.data.etag,
          syncStatus: 'SYNCED',
          lastSyncedAt: new Date(),
          syncError: null,
        },
      });

      this.logger.log(
        `Calendar event created for appointment ${appointmentId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to create calendar event for appointment ${appointmentId}`,
        error instanceof Error ? error.stack : error,
      );
      await this.prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          syncStatus: 'FAILED',
          syncError: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      throw error;
    }
  }

  async updateEvent(
    tutorId: string,
    appointmentId: string,
    event: CalendarEventInput,
    timeZone?: string,
    googleEventId?: string,
  ): Promise<void> {
    // O id do evento pode vir de quem já carregou o appointment (`syncAllPending`).
    const eventId =
      googleEventId ??
      (
        await this.prisma.appointment.findUnique({
          where: { id: appointmentId },
          select: { googleEventId: true },
        })
      )?.googleEventId;
    if (!eventId) return;

    const calendar = await this.getCalendarClient(tutorId);
    if (!calendar) return;

    try {
      const endTime = new Date(
        event.startTime.getTime() + event.durationMinutes * 60_000,
      );

      const tz = timeZone ?? (await this.tutorTimeZone(tutorId));

      const res = await calendar.events.update({
        calendarId: 'primary',
        eventId,
        requestBody: {
          summary: event.title,
          description: event.description,
          start: {
            dateTime: event.startTime.toISOString(),
            timeZone: tz,
          },
          end: {
            dateTime: endTime.toISOString(),
            timeZone: tz,
          },
          location: event.location,
        },
      });

      await this.prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          googleEtag: res.data.etag,
          syncStatus: 'SYNCED',
          lastSyncedAt: new Date(),
          syncError: null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to update calendar event for appointment ${appointmentId}`,
        error instanceof Error ? error.stack : error,
      );
      await this.prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          syncStatus: 'FAILED',
          syncError: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      throw error;
    }
  }

  async deleteEvent(tutorId: string, googleEventId: string): Promise<void> {
    const calendar = await this.getCalendarClient(tutorId);
    if (!calendar) return;

    try {
      await calendar.events.delete({
        calendarId: 'primary',
        eventId: googleEventId,
      });
    } catch (error) {
      // Apagar é idempotente: se o evento já não está lá, o objetivo foi
      // atingido. Sem isso, apagar duas vezes virava erro, 3 retries e DLQ.
      if (isAlreadyGoneError(error)) {
        this.logger.log(
          `Calendar event ${googleEventId} já não existe no Google; nada a apagar`,
        );
        return;
      }
      this.logger.error(
        `Failed to delete calendar event ${googleEventId}`,
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }

  async syncAppointment(tutorId: string, appointmentId: string): Promise<void> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });
    if (!appointment) return;

    await this.syncOne(tutorId, appointment);
  }

  /**
   * Sincroniza um agendamento já carregado.
   *
   * Existe para o laço do `syncAllPending` não refazer, por item, o
   * `findUnique` do agendamento que o `findMany` acabou de trazer nem a busca
   * do fuso do tutor, que é o mesmo para a leva inteira.
   */
  private async syncOne(
    tutorId: string,
    appointment: Appointment,
    timeZone?: string,
  ): Promise<void> {
    const event: CalendarEventInput = {
      title: appointment.title,
      description: appointment.description ?? undefined,
      startTime: appointment.scheduledAt,
      durationMinutes: appointment.durationMinutes,
      location: appointment.location ?? undefined,
    };

    if (appointment.googleEventId) {
      await this.updateEvent(
        tutorId,
        appointment.id,
        event,
        timeZone,
        appointment.googleEventId,
      );
    } else {
      await this.createEvent(tutorId, appointment.id, event, timeZone);
    }
  }

  /**
   * Sincroniza o que ficou pendente e devolve quantos realmente foram parar na
   * agenda do Google.
   *
   * Contava `pending.length`, o tamanho da fila de entrada: com o token
   * revogado, todas as chamadas falhavam e o `POST /calendar/sync` ainda
   * respondia `{synced: 12}` — o app dizia ao tutor que sincronizou quando não
   * criou evento nenhum. O que o tutor precisa saber é quantos deram certo.
   */
  async syncAllPending(tutorId: string): Promise<number> {
    const connected = await this.isConnected(tutorId);
    if (!connected) return 0;

    const pending = await this.prisma.appointment.findMany({
      where: {
        tutorId,
        syncStatus: { in: ['PENDING_CREATE', 'PENDING_UPDATE', 'FAILED'] },
      },
    });
    if (pending.length === 0) return 0;

    const timeZone = await this.tutorTimeZone(tutorId);

    let synced = 0;
    for (const appointment of pending) {
      try {
        await this.syncOne(tutorId, appointment, timeZone);
        synced++;
      } catch (error) {
        // syncStatus=FAILED is already persisted inside createEvent/updateEvent.
        this.logger.warn(
          `Sync failed for appointment ${appointment.id}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }

    if (synced < pending.length) {
      this.logger.warn(
        `Sync do tutor ${tutorId}: ${synced}/${pending.length} agendamento(s) sincronizado(s)`,
      );
    }
    return synced;
  }

  /** Fuso do tutor, com o padrão do projeto quando a conta não tem um. */
  private async tutorTimeZone(tutorId: string): Promise<string> {
    const tutor = await this.prisma.tutor.findUnique({
      where: { id: tutorId },
      select: { timezone: true },
    });
    return resolveTimeZone(tutor?.timezone);
  }

  private async getCalendarClient(
    tutorId: string,
  ): Promise<calendar_v3.Calendar | null> {
    const token = await this.prisma.googleOAuthToken.findUnique({
      where: { tutorId },
    });
    if (!token) return null;

    const oauth2Client = this.createOAuth2Client();
    oauth2Client.setCredentials({
      access_token: this.encryption.decrypt(token.accessToken),
      refresh_token: this.encryption.decrypt(token.refreshToken),
      expiry_date: token.expiresAt.getTime(),
    });

    oauth2Client.on('tokens', (newTokens) => {
      void this.prisma.googleOAuthToken.update({
        where: { tutorId },
        data: {
          // token.accessToken já está cifrado; só re-cifra quando há novo valor.
          accessToken: newTokens.access_token
            ? this.encryption.encrypt(newTokens.access_token)
            : token.accessToken,
          expiresAt: newTokens.expiry_date
            ? new Date(newTokens.expiry_date)
            : token.expiresAt,
        },
      });
    });

    return google.calendar({ version: 'v3', auth: oauth2Client });
  }
}
