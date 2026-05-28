import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { CalendarSyncPublisher } from '../calendar-sync.publisher';
import type { CalendarSyncMessage } from '../dto/calendar-sync.message';
import {
  CALENDAR_SYNC_CLIENT,
  CALENDAR_SYNC_PATTERN,
} from '../queue.constants';

const baseMessage: CalendarSyncMessage = {
  action: 'CREATE',
  appointment_id: 'appt-1',
  tutor_id: 'tutor-1',
};

describe('CalendarSyncPublisher', () => {
  let publisher: CalendarSyncPublisher;
  let client: { emit: jest.Mock };

  beforeEach(async () => {
    client = { emit: jest.fn().mockReturnValue(of(undefined)) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarSyncPublisher,
        { provide: CALENDAR_SYNC_CLIENT, useValue: client as unknown },
      ],
    }).compile();

    publisher = module.get<CalendarSyncPublisher>(CalendarSyncPublisher);
  });

  it('emits a calendar.sync event with the full message payload', async () => {
    await publisher.publish(baseMessage);

    expect(client.emit).toHaveBeenCalledWith(
      CALENDAR_SYNC_PATTERN,
      baseMessage,
    );
  });

  it('rethrows publish errors so the caller can react', async () => {
    const cause = new Error('rmq down');
    client.emit.mockReturnValue(throwError(() => cause));

    await expect(publisher.publish(baseMessage)).rejects.toThrow(cause);
  });
});
