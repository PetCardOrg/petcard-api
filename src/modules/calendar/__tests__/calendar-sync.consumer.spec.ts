import { RmqContext } from '@nestjs/microservices';
import { Test, TestingModule } from '@nestjs/testing';
import type { CalendarSyncMessage } from '../../queue/dto/calendar-sync.message';
import {
  CALENDAR_SYNC_MAX_RETRIES,
  CALENDAR_SYNC_RETRY_HEADER,
} from '../../queue/queue.constants';
import { CalendarSyncConsumer } from '../calendar-sync.consumer';
import { GoogleCalendarService } from '../google-calendar.service';

const createMessage = (
  overrides: Partial<CalendarSyncMessage> = {},
): CalendarSyncMessage => ({
  action: 'CREATE',
  appointment_id: 'appt-1',
  tutor_id: 'tutor-1',
  ...overrides,
});

const buildContext = (
  channel: { ack: jest.Mock; nack: jest.Mock; publish: jest.Mock },
  payload: CalendarSyncMessage,
  headers: Record<string, unknown> = {},
) => {
  const message = {
    content: Buffer.from(JSON.stringify(payload)),
    fields: { routingKey: 'calendar.sync' },
    properties: { headers },
  };
  const context = {
    getChannelRef: () => channel,
    getMessage: () => message,
  } as unknown as RmqContext;
  return { context, message };
};

describe('CalendarSyncConsumer', () => {
  let consumer: CalendarSyncConsumer;
  let calendarService: {
    syncAppointment: jest.Mock;
    deleteEvent: jest.Mock;
  };
  let channel: { ack: jest.Mock; nack: jest.Mock; publish: jest.Mock };

  beforeEach(async () => {
    calendarService = {
      syncAppointment: jest.fn().mockResolvedValue(undefined),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
    };
    channel = { ack: jest.fn(), nack: jest.fn(), publish: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarSyncConsumer,
        { provide: GoogleCalendarService, useValue: calendarService },
      ],
    }).compile();

    consumer = module.get(CalendarSyncConsumer);
  });

  it('calls syncAppointment and acks on a successful CREATE', async () => {
    const payload = createMessage({ action: 'CREATE' });
    const { context, message } = buildContext(channel, payload);

    await consumer.handleSync(payload, context);

    expect(calendarService.syncAppointment).toHaveBeenCalledWith(
      'tutor-1',
      'appt-1',
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
    expect(channel.publish).not.toHaveBeenCalled();
  });

  it('calls syncAppointment and acks on a successful UPDATE', async () => {
    const payload = createMessage({ action: 'UPDATE' });
    const { context, message } = buildContext(channel, payload);

    await consumer.handleSync(payload, context);

    expect(calendarService.syncAppointment).toHaveBeenCalledWith(
      'tutor-1',
      'appt-1',
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('calls deleteEvent with the google_event_id and acks on DELETE', async () => {
    const payload = createMessage({
      action: 'DELETE',
      google_event_id: 'evt-42',
    });
    const { context, message } = buildContext(channel, payload);

    await consumer.handleSync(payload, context);

    expect(calendarService.deleteEvent).toHaveBeenCalledWith(
      'tutor-1',
      'evt-42',
    );
    expect(calendarService.syncAppointment).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('acks and skips DELETE messages missing google_event_id', async () => {
    const payload = createMessage({ action: 'DELETE' });
    const { context, message } = buildContext(channel, payload);

    await consumer.handleSync(payload, context);

    expect(calendarService.deleteEvent).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('acks and skips messages with missing required fields', async () => {
    const payload = {} as unknown as CalendarSyncMessage;
    const { context, message } = buildContext(channel, createMessage());

    await consumer.handleSync(payload, context);

    expect(calendarService.syncAppointment).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('acks without retry on a permanent OAuth error (invalid_grant)', async () => {
    calendarService.syncAppointment.mockRejectedValue(
      new Error('invalid_grant: Token has been expired or revoked.'),
    );
    const payload = createMessage({ action: 'UPDATE' });
    const { context, message } = buildContext(channel, payload);

    await consumer.handleSync(payload, context);

    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.publish).not.toHaveBeenCalled();
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('acks UPDATE when the event is already gone (404)', async () => {
    const notFound = Object.assign(new Error('Not Found'), { code: 404 });
    calendarService.syncAppointment.mockRejectedValue(notFound);
    const payload = createMessage({ action: 'UPDATE' });
    const { context, message } = buildContext(channel, payload);

    await consumer.handleSync(payload, context);

    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.publish).not.toHaveBeenCalled();
  });

  it('acks DELETE when the event was already deleted (410)', async () => {
    // O Google devolve 410 "Resource has been deleted" ao apagar o que já foi
    // apagado. Antes isso rendia 3 retries e DLQ.
    const gone = Object.assign(new Error('Resource has been deleted'), {
      code: 410,
    });
    calendarService.deleteEvent.mockRejectedValue(gone);
    const payload = createMessage({
      action: 'DELETE',
      google_event_id: 'evt-1',
    });
    const { context, message } = buildContext(channel, payload);

    await consumer.handleSync(payload, context);

    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.publish).not.toHaveBeenCalled();
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('retries with incremented counter on a transient error', async () => {
    const transient = Object.assign(new Error('Service Unavailable'), {
      code: 503,
    });
    calendarService.syncAppointment.mockRejectedValue(transient);
    const payload = createMessage({ action: 'CREATE' });
    const { context, message } = buildContext(channel, payload);

    await consumer.handleSync(payload, context);

    expect(channel.publish).toHaveBeenCalledWith(
      '',
      'calendar.sync',
      message.content,
      expect.objectContaining({
        headers: expect.objectContaining({
          [CALENDAR_SYNC_RETRY_HEADER]: 1,
        }) as unknown,
      }),
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('nacks to DLQ when retries are exhausted', async () => {
    const transient = Object.assign(new Error('Service Unavailable'), {
      code: 503,
    });
    calendarService.syncAppointment.mockRejectedValue(transient);
    const payload = createMessage({ action: 'CREATE' });
    const { context, message } = buildContext(channel, payload, {
      [CALENDAR_SYNC_RETRY_HEADER]: CALENDAR_SYNC_MAX_RETRIES,
    });

    await consumer.handleSync(payload, context);

    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(channel.publish).not.toHaveBeenCalled();
    expect(channel.ack).not.toHaveBeenCalled();
  });
});
