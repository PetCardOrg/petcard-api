import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationKind } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationService } from '../../notification/notification.service';
import { DoseReminderService } from '../dose-reminder.service';

const DAY_MS = 24 * 60 * 60 * 1000;

const vaccineRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'vac-1',
  petId: 'pet-1',
  nextDoseAt: new Date(Date.now() + 2 * DAY_MS),
  lastNotifiedAt: null,
  pet: { name: 'Rex', tutorId: 'tutor-1' },
  ...overrides,
});

describe('DoseReminderService', () => {
  let service: DoseReminderService;
  let prisma: {
    vaccineRecord: { findMany: jest.Mock; update: jest.Mock };
    dewormingRecord: { findMany: jest.Mock; update: jest.Mock };
    medicationRecord: { findMany: jest.Mock; update: jest.Mock };
  };
  let notificationService: { schedulePush: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    prisma = {
      vaccineRecord: { findMany: jest.fn(), update: jest.fn() },
      dewormingRecord: { findMany: jest.fn(), update: jest.fn() },
      medicationRecord: { findMany: jest.fn(), update: jest.fn() },
    };
    notificationService = {
      schedulePush: jest.fn().mockResolvedValue([{ id: 'n1' }]),
    };
    config = {
      get: jest.fn((key: string) => {
        if (key === 'reminder.enabled') return true;
        if (key === 'reminder.windowDays') return 3;
        return undefined;
      }),
    };
    prisma.vaccineRecord.findMany.mockResolvedValue([]);
    prisma.dewormingRecord.findMany.mockResolvedValue([]);
    prisma.medicationRecord.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DoseReminderService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationService, useValue: notificationService },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(DoseReminderService);
  });

  describe('handleCron', () => {
    it('skips the run when DOSE_REMINDER_ENABLED is false', async () => {
      config.get.mockImplementation((key: string) =>
        key === 'reminder.enabled' ? false : undefined,
      );

      await service.handleCron();

      expect(prisma.vaccineRecord.findMany).not.toHaveBeenCalled();
      expect(prisma.dewormingRecord.findMany).not.toHaveBeenCalled();
    });

    it('runs the reminders when enabled', async () => {
      await service.handleCron();

      expect(prisma.vaccineRecord.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.dewormingRecord.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('runDoseReminders', () => {
    it('returns zero counts when no records are in the window', async () => {
      const result = await service.runDoseReminders();

      expect(result).toEqual({ vaccine: 0, deworming: 0, medication: 0 });
      expect(notificationService.schedulePush).not.toHaveBeenCalled();
    });

    it('schedules a push and stamps lastNotifiedAt for a due vaccine record', async () => {
      prisma.vaccineRecord.findMany.mockResolvedValue([vaccineRecord()]);

      const result = await service.runDoseReminders();

      expect(result.vaccine).toBe(1);
      expect(notificationService.schedulePush).toHaveBeenCalledWith(
        expect.objectContaining({
          tutorId: 'tutor-1',
          kind: NotificationKind.DOSE_REMINDER,
          referenceType: 'VACCINE_RECORD',
          referenceId: 'vac-1',
        }),
      );
      expect(prisma.vaccineRecord.update).toHaveBeenCalledWith({
        where: { id: 'vac-1' },
        data: { lastNotifiedAt: expect.any(Date) as unknown },
      });
    });

    it('skips a record already notified within its current dose window', async () => {
      prisma.vaccineRecord.findMany.mockResolvedValue([
        vaccineRecord({ lastNotifiedAt: new Date() }),
      ]);

      const result = await service.runDoseReminders();

      expect(result.vaccine).toBe(0);
      expect(notificationService.schedulePush).not.toHaveBeenCalled();
      expect(prisma.vaccineRecord.update).not.toHaveBeenCalled();
    });

    it('re-notifies when the last push predates the current dose window', async () => {
      prisma.vaccineRecord.findMany.mockResolvedValue([
        vaccineRecord({
          nextDoseAt: new Date(Date.now() + 2 * DAY_MS),
          lastNotifiedAt: new Date(Date.now() - 30 * DAY_MS),
        }),
      ]);

      const result = await service.runDoseReminders();

      expect(result.vaccine).toBe(1);
      expect(notificationService.schedulePush).toHaveBeenCalledTimes(1);
    });

    it('does not stamp lastNotifiedAt when the tutor has no device tokens', async () => {
      prisma.vaccineRecord.findMany.mockResolvedValue([vaccineRecord()]);
      notificationService.schedulePush.mockResolvedValue([]);

      const result = await service.runDoseReminders();

      expect(result.vaccine).toBe(0);
      expect(prisma.vaccineRecord.update).not.toHaveBeenCalled();
    });

    it('processes deworming records the same way', async () => {
      prisma.dewormingRecord.findMany.mockResolvedValue([
        {
          id: 'dew-1',
          petId: 'pet-1',
          nextDoseAt: new Date(Date.now() + 1 * DAY_MS),
          lastNotifiedAt: null,
          pet: { name: 'Rex', tutorId: 'tutor-1' },
        },
      ]);

      const result = await service.runDoseReminders();

      expect(result.deworming).toBe(1);
      expect(notificationService.schedulePush).toHaveBeenCalledWith(
        expect.objectContaining({ referenceType: 'DEWORMING_RECORD' }),
      );
      expect(prisma.dewormingRecord.update).toHaveBeenCalledWith({
        where: { id: 'dew-1' },
        data: { lastNotifiedAt: expect.any(Date) as unknown },
      });
    });

    it('schedules a reminder when a medication treatment is about to start (api#111)', async () => {
      prisma.medicationRecord.findMany.mockResolvedValue([
        {
          id: 'med-1',
          petId: 'pet-1',
          medicationName: 'Amoxicilina',
          startDate: new Date(Date.now() + 2 * DAY_MS),
          lastNotifiedAt: null,
          pet: { name: 'Rex', tutorId: 'tutor-1' },
        },
      ]);

      const result = await service.runDoseReminders();

      expect(result.medication).toBe(1);
      expect(notificationService.schedulePush).toHaveBeenCalledWith(
        expect.objectContaining({
          tutorId: 'tutor-1',
          referenceType: 'MEDICATION_RECORD',
          referenceId: 'med-1',
        }),
      );
      expect(prisma.medicationRecord.update).toHaveBeenCalledWith({
        where: { id: 'med-1' },
        data: { lastNotifiedAt: expect.any(Date) as unknown },
      });
    });

    it('does not re-notify a medication already notified for its start date', async () => {
      prisma.medicationRecord.findMany.mockResolvedValue([
        {
          id: 'med-1',
          petId: 'pet-1',
          medicationName: 'Amoxicilina',
          startDate: new Date(Date.now() + 2 * DAY_MS),
          lastNotifiedAt: new Date(),
          pet: { name: 'Rex', tutorId: 'tutor-1' },
        },
      ]);

      const result = await service.runDoseReminders();

      expect(result.medication).toBe(0);
      expect(prisma.medicationRecord.update).not.toHaveBeenCalled();
    });

    it('só busca medicação sem deletedAt e dentro da janela', async () => {
      await service.runDoseReminders();

      const [[queryArg]] = prisma.medicationRecord.findMany.mock.calls as Array<
        [{ where: { deletedAt: unknown } }]
      >;
      expect(queryArg.where.deletedAt).toBeNull();
    });
  });
});
