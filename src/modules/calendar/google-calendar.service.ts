import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../../prisma/prisma.service';

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.clientId =
      this.configService.get<string>('googleCalendar.clientId') ?? '';
    this.clientSecret =
      this.configService.get<string>('googleCalendar.clientSecret') ?? '';
    this.redirectUri =
      this.configService.get<string>('googleCalendar.redirectUri') ?? '';
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
      state: tutorId,
    });
  }

  async handleCallback(code: string, tutorId: string): Promise<void> {
    const oauth2Client = this.createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    await this.prisma.googleOAuthToken.upsert({
      where: { tutorId },
      update: {
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token ?? undefined,
        expiresAt: new Date(tokens.expiry_date!),
        scopes: SCOPES,
      },
      create: {
        tutorId,
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token!,
        expiresAt: new Date(tokens.expiry_date!),
        scopes: SCOPES,
      },
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
    event: {
      title: string;
      description?: string;
      startTime: Date;
      durationMinutes: number;
      location?: string;
    },
  ): Promise<void> {
    const calendar = await this.getCalendarClient(tutorId);
    if (!calendar) return;

    try {
      const endTime = new Date(
        event.startTime.getTime() + event.durationMinutes * 60_000,
      );

      const tutor = await this.prisma.tutor.findUnique({
        where: { id: tutorId },
        select: { timezone: true },
      });

      const res = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: event.title,
          description: event.description,
          start: {
            dateTime: event.startTime.toISOString(),
            timeZone: tutor?.timezone ?? 'America/Fortaleza',
          },
          end: {
            dateTime: endTime.toISOString(),
            timeZone: tutor?.timezone ?? 'America/Fortaleza',
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
    event: {
      title: string;
      description?: string;
      startTime: Date;
      durationMinutes: number;
      location?: string;
    },
  ): Promise<void> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });
    if (!appointment?.googleEventId) return;

    const calendar = await this.getCalendarClient(tutorId);
    if (!calendar) return;

    try {
      const endTime = new Date(
        event.startTime.getTime() + event.durationMinutes * 60_000,
      );

      const tutor = await this.prisma.tutor.findUnique({
        where: { id: tutorId },
        select: { timezone: true },
      });

      const res = await calendar.events.update({
        calendarId: 'primary',
        eventId: appointment.googleEventId,
        requestBody: {
          summary: event.title,
          description: event.description,
          start: {
            dateTime: event.startTime.toISOString(),
            timeZone: tutor?.timezone ?? 'America/Fortaleza',
          },
          end: {
            dateTime: endTime.toISOString(),
            timeZone: tutor?.timezone ?? 'America/Fortaleza',
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
      include: { pet: { select: { name: true } } },
    });
    if (!appointment) return;

    const event = {
      title: appointment.title,
      description: appointment.description ?? undefined,
      startTime: appointment.scheduledAt,
      durationMinutes: appointment.durationMinutes,
      location: appointment.location ?? undefined,
    };

    if (appointment.googleEventId) {
      await this.updateEvent(tutorId, appointmentId, event);
    } else {
      await this.createEvent(tutorId, appointmentId, event);
    }
  }

  async syncAllPending(tutorId: string): Promise<number> {
    const connected = await this.isConnected(tutorId);
    if (!connected) return 0;

    const pending = await this.prisma.appointment.findMany({
      where: {
        tutorId,
        syncStatus: { in: ['PENDING_CREATE', 'PENDING_UPDATE', 'FAILED'] },
      },
    });

    for (const appointment of pending) {
      try {
        await this.syncAppointment(tutorId, appointment.id);
      } catch (error) {
        // syncStatus=FAILED is already persisted inside createEvent/updateEvent.
        this.logger.warn(
          `Sync failed for appointment ${appointment.id}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }

    return pending.length;
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
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
      expiry_date: token.expiresAt.getTime(),
    });

    oauth2Client.on('tokens', (newTokens) => {
      void this.prisma.googleOAuthToken.update({
        where: { tutorId },
        data: {
          accessToken: newTokens.access_token ?? token.accessToken,
          expiresAt: newTokens.expiry_date
            ? new Date(newTokens.expiry_date)
            : token.expiresAt,
        },
      });
    });

    return google.calendar({ version: 'v3', auth: oauth2Client });
  }
}
