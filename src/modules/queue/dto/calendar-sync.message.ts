export type CalendarSyncAction = 'CREATE' | 'UPDATE' | 'DELETE';

export interface CalendarSyncMessage {
  action: CalendarSyncAction;
  appointment_id: string;
  tutor_id: string;
  // Required for DELETE: the appointment row is gone by the time the worker runs.
  google_event_id?: string;
}
