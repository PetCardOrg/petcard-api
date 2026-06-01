import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import type { CalendarSyncMessage } from './dto/calendar-sync.message';
import { CALENDAR_SYNC_CLIENT, CALENDAR_SYNC_PATTERN } from './queue.constants';

@Injectable()
export class CalendarSyncPublisher {
  private readonly logger = new Logger(CalendarSyncPublisher.name);

  constructor(
    @Inject(CALENDAR_SYNC_CLIENT) private readonly client: ClientProxy,
  ) {}

  async publish(message: CalendarSyncMessage): Promise<void> {
    try {
      await lastValueFrom(this.client.emit(CALENDAR_SYNC_PATTERN, message));
    } catch (error) {
      this.logger.error(
        `Failed to publish calendar.sync (${message.action}) for appointment ${message.appointment_id}`,
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }
}
