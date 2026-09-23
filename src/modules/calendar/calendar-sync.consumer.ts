import { Controller, Logger } from '@nestjs/common';
import { Ctx, MessagePattern, Payload } from '@nestjs/microservices';
import type { RmqContext } from '@nestjs/microservices';
import type { Channel, ConsumeMessage } from 'amqplib';
import type { CalendarSyncMessage } from '../queue/dto/calendar-sync.message';
import {
  CALENDAR_SYNC_MAX_RETRIES,
  CALENDAR_SYNC_PATTERN,
  CALENDAR_SYNC_RETRY_HEADER,
} from '../queue/queue.constants';
import { GoogleCalendarService } from './google-calendar.service';
import { extractGoogleStatus, isAlreadyGoneError } from './google-api-error';

@Controller()
export class CalendarSyncConsumer {
  private readonly logger = new Logger(CalendarSyncConsumer.name);

  constructor(private readonly calendarService: GoogleCalendarService) {}

  @MessagePattern(CALENDAR_SYNC_PATTERN)
  async handleSync(
    @Payload() data: CalendarSyncMessage,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef() as Channel;
    const message = context.getMessage() as ConsumeMessage;

    if (!data?.appointment_id || !data?.tutor_id || !data?.action) {
      this.logger.warn(
        'Received calendar.sync message with missing appointment_id/tutor_id/action',
      );
      channel.ack(message);
      return;
    }

    if (data.action === 'DELETE' && !data.google_event_id) {
      this.logger.warn(
        `DELETE message for appointment ${data.appointment_id} missing google_event_id; skipping`,
      );
      channel.ack(message);
      return;
    }

    try {
      if (data.action === 'DELETE') {
        await this.calendarService.deleteEvent(
          data.tutor_id,
          data.google_event_id!,
        );
      } else {
        // syncAppointment branches between createEvent/updateEvent based on
        // the current googleEventId — handles CREATE and UPDATE uniformly.
        await this.calendarService.syncAppointment(
          data.tutor_id,
          data.appointment_id,
        );
      }

      this.logger.log(
        `Calendar ${data.action} synced for appointment ${data.appointment_id}`,
      );
      channel.ack(message);
    } catch (error) {
      // Refresh token revoked — only the tutor can fix this by reconnecting.
      // Descarta o token morto para que /calendar/status pare de dizer que está
      // conectado: é assim que o banner do app vira "conectar" e o tutor
      // descobre que os agendamentos deixaram de ir para a agenda.
      if (this.isPermanentAuthError(error)) {
        this.logger.warn(
          `Calendar OAuth revoked for appointment ${data.appointment_id}; dropping stored token`,
        );
        await this.calendarService.disconnect(data.tutor_id);
        channel.ack(message);
        return;
      }

      // Event already gone on the Google side — UPDATE/DELETE are idempotent here.
      if (data.action !== 'CREATE' && isAlreadyGoneError(error)) {
        this.logger.warn(
          `Calendar event missing for appointment ${data.appointment_id} (${data.action}); treating as success`,
        );
        channel.ack(message);
        return;
      }

      const reason = error instanceof Error ? error.message : String(error);
      await this.retryOrDlq(
        data.appointment_id,
        data.action,
        reason,
        channel,
        message,
      );
    }
  }

  private async retryOrDlq(
    appointmentId: string,
    action: string,
    reason: string,
    channel: Channel,
    message: ConsumeMessage,
  ): Promise<void> {
    const retryCount = this.getRetryCount(message);

    if (retryCount < CALENDAR_SYNC_MAX_RETRIES) {
      this.logger.warn(
        `Retry ${retryCount + 1}/${CALENDAR_SYNC_MAX_RETRIES} for appointment ${appointmentId} (${action}): ${reason}`,
      );
      channel.publish('', message.fields.routingKey, message.content, {
        ...message.properties,
        headers: {
          ...message.properties.headers,
          [CALENDAR_SYNC_RETRY_HEADER]: retryCount + 1,
        },
      });
      channel.ack(message);
      return Promise.resolve();
    }

    this.logger.error(
      `Exhausted retries for appointment ${appointmentId} (${action}): ${reason}; routing to DLQ`,
    );
    channel.nack(message, false, false);
    return Promise.resolve();
  }

  private isPermanentAuthError(error: unknown): boolean {
    if (extractGoogleStatus(error) === 401) return true;
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    return (
      message.includes('invalid_grant') ||
      message.includes('token has been expired or revoked')
    );
  }

  private getRetryCount(message: ConsumeMessage): number {
    const raw: unknown =
      message.properties.headers?.[CALENDAR_SYNC_RETRY_HEADER];
    return typeof raw === 'number' ? raw : 0;
  }
}
