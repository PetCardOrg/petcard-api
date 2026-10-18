import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import type {
  AppointmentSyncMessage,
  HealthRecordType,
} from './dto/calendar-sync.message';
import { CALENDAR_SYNC_CLIENT, CALENDAR_SYNC_PATTERN } from './queue.constants';

@Injectable()
export class CalendarSyncPublisher {
  private readonly logger = new Logger(CalendarSyncPublisher.name);

  constructor(
    @Inject(CALENDAR_SYNC_CLIENT) private readonly client: ClientProxy,
  ) {}

  async publish(message: AppointmentSyncMessage): Promise<void> {
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

  /**
   * Avisa que um registro de saúde mudou. Melhor esforço: o registro clínico
   * já foi gravado, e a agenda é conveniência do tutor — uma fila fora do ar
   * não pode transformar o registro de uma vacina em erro. O que se perder
   * aqui volta na próxima conexão (catch-up do callback).
   */
  async publishHealthRecord(
    recordType: HealthRecordType,
    recordId: string,
  ): Promise<void> {
    try {
      await lastValueFrom(
        this.client.emit(CALENDAR_SYNC_PATTERN, {
          kind: 'HEALTH_RECORD',
          record_type: recordType,
          record_id: recordId,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Falha ao publicar calendar.sync do registro ${recordType} ${recordId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
