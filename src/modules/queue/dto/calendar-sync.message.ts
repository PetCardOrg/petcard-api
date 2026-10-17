export type CalendarSyncAction = 'CREATE' | 'UPDATE' | 'DELETE';

export interface AppointmentSyncMessage {
  /** Ausente nas mensagens publicadas antes da sincronização de saúde. */
  kind?: 'APPOINTMENT';
  action: CalendarSyncAction;
  appointment_id: string;
  tutor_id: string;
  // Required for DELETE: the appointment row is gone by the time the worker runs.
  google_event_id?: string;
}

/** Registros de saúde que viram evento na agenda do tutor. */
export type HealthRecordType = 'VACINA' | 'VERMIFUGO' | 'MEDICACAO';

/**
 * Um registro de saúde mudou (criado, editado ou apagado). Sem `action`: o
 * worker relê o registro e deixa a agenda igual a ele — criar, atualizar ou
 * apagar o evento sai dessa comparação, o que torna a mensagem idempotente e
 * imune a chegar fora de ordem.
 */
export interface HealthRecordSyncMessage {
  kind: 'HEALTH_RECORD';
  record_type: HealthRecordType;
  record_id: string;
}

export type CalendarSyncMessage =
  | AppointmentSyncMessage
  | HealthRecordSyncMessage;
