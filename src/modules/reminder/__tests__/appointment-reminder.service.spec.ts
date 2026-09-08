import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationKind } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationService } from '../../notification/notification.service';
import { AppointmentReminderService } from '../appointment-reminder.service';

const HOUR_MS = 60 * 60 * 1000;

const appointment = (overrides: Record<string, unknown> = {}) => ({
  id: 'appt-1',
  tutorId: 'tutor-1',
  title: 'Consulta de rotina',
  scheduledAt: new Date(Date.now() + 12 * HOUR_MS),
  lastNotifiedAt: null,
  pet: { name: 'Rex' },
  tutor: { timezone: 'America/Sao_Paulo' },
  ...overrides,
});

describe('AppointmentReminderService', () => {
  let service: AppointmentReminderService;
  let prisma: {
    appointment: {
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let notificationService: { schedulePush: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    prisma = {
      appointment: {
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    notificationService = {
      schedulePush: jest.fn().mockResolvedValue([{ id: 'n1' }]),
    };
    config = {
      get: jest.fn((key: string) => {
        if (key === 'reminder.appointmentEnabled') return true;
        if (key === 'reminder.appointmentWindowHours') return 24;
        return undefined;
      }),
    };
    prisma.appointment.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentReminderService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationService, useValue: notificationService },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(AppointmentReminderService);
  });

  describe('handleCron', () => {
    it('skips the run when APPOINTMENT_REMINDER_ENABLED is false', async () => {
      config.get.mockImplementation((key: string) =>
        key === 'reminder.appointmentEnabled' ? false : undefined,
      );

      await service.handleCron();

      expect(prisma.appointment.findMany).not.toHaveBeenCalled();
    });

    it('runs the reminders when enabled', async () => {
      await service.handleCron();

      expect(prisma.appointment.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('runAppointmentReminders', () => {
    it('only queries appointments not yet notified, within the window', async () => {
      await service.runAppointmentReminders();

      const [[queryArg]] = prisma.appointment.findMany.mock.calls as Array<
        [{ where: { lastNotifiedAt: unknown } }]
      >;
      expect(queryArg.where.lastNotifiedAt).toBeNull();
    });

    it('schedules a push and stamps lastNotifiedAt for a due appointment', async () => {
      prisma.appointment.findMany.mockResolvedValue([appointment()]);

      const scheduled = await service.runAppointmentReminders();

      expect(scheduled).toBe(1);
      expect(notificationService.schedulePush).toHaveBeenCalledWith(
        expect.objectContaining({
          tutorId: 'tutor-1',
          appointmentId: 'appt-1',
          kind: NotificationKind.APPOINTMENT_REMINDER,
          referenceType: 'APPOINTMENT',
          referenceId: 'appt-1',
        }),
      );
      expect(prisma.appointment.updateMany).toHaveBeenCalledWith({
        where: { id: 'appt-1', lastNotifiedAt: null },
        data: { lastNotifiedAt: expect.any(Date) as unknown },
      });
    });

    it('solta a reivindicação quando o tutor não tem device token', async () => {
      prisma.appointment.findMany.mockResolvedValue([appointment()]);
      notificationService.schedulePush.mockResolvedValue([]);

      const scheduled = await service.runAppointmentReminders();

      expect(scheduled).toBe(0);
      expect(prisma.appointment.update).toHaveBeenCalledWith({
        where: { id: 'appt-1' },
        data: { lastNotifiedAt: null },
      });
    });

    it('não envia o push quando outra instância já reivindicou o agendamento', async () => {
      prisma.appointment.findMany.mockResolvedValue([appointment()]);
      prisma.appointment.updateMany.mockResolvedValue({ count: 0 });

      const scheduled = await service.runAppointmentReminders();

      expect(scheduled).toBe(0);
      expect(notificationService.schedulePush).not.toHaveBeenCalled();
    });

    it('escreve o horário no fuso do tutor, não no do processo', async () => {
      // 01/03 às 02:00 UTC = 23:00 de 28/02 em Sao_Paulo (UTC-3).
      prisma.appointment.findMany.mockResolvedValue([
        appointment({ scheduledAt: new Date('2026-03-01T02:00:00Z') }),
      ]);

      await service.runAppointmentReminders();

      expect(notificationService.schedulePush).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('28/02/2026, 23:00') as unknown,
        }),
      );
    });

    it('works without a linked pet', async () => {
      prisma.appointment.findMany.mockResolvedValue([
        appointment({ pet: null }),
      ]);

      const scheduled = await service.runAppointmentReminders();

      expect(scheduled).toBe(1);
      expect(notificationService.schedulePush).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('Consulta de rotina') as unknown,
        }),
      );
    });
  });
});
