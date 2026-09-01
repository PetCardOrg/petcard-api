import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Lembrete de agendamento (api#111).
 *
 * Ao contrário do lembrete de dose (recorrente, uma janela por dose), o de
 * agendamento é único: uma consulta só acontece uma vez, então basta filtrar
 * `lastNotifiedAt: null` em vez de recalcular uma janela — assim que o aviso
 * sai, o registro para de aparecer na varredura. Reagendar (`scheduled_at`
 * novo) zera o campo em `AppointmentService.update` para liberar um aviso
 * novo.
 */
@Injectable()
export class AppointmentReminderService {
  private readonly logger = new Logger(AppointmentReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, {
    name: 'appointment-reminder',
    timeZone: 'America/Fortaleza',
  })
  async handleCron(): Promise<void> {
    if (!this.config.get<boolean>('reminder.appointmentEnabled')) {
      this.logger.debug('Appointment reminder cron disabled; skipping run');
      return;
    }
    await this.runAppointmentReminders();
  }

  async runAppointmentReminders(): Promise<number> {
    const windowHours =
      this.config.get<number>('reminder.appointmentWindowHours') ?? 24;
    const now = new Date();
    const windowEnd = new Date(now.getTime() + windowHours * HOUR_MS);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        scheduledAt: { gte: now, lte: windowEnd },
        lastNotifiedAt: null,
      },
      include: { pet: { select: { name: true } } },
    });

    let scheduled = 0;
    for (const appointment of appointments) {
      const when = appointment.scheduledAt.toLocaleString('pt-BR', {
        timeZone: 'America/Fortaleza',
        dateStyle: 'short',
        timeStyle: 'short',
      });
      const label = appointment.pet?.name
        ? `${appointment.pet.name}: consulta "${appointment.title}" marcada para ${when}.`
        : `Consulta "${appointment.title}" marcada para ${when}.`;

      const notifications = await this.notificationService.schedulePush({
        tutorId: appointment.tutorId,
        appointmentId: appointment.id,
        kind: NotificationKind.APPOINTMENT_REMINDER,
        referenceType: 'APPOINTMENT',
        referenceId: appointment.id,
        title: 'Consulta chegando',
        body: label,
        data: { reference_type: 'APPOINTMENT', reference_id: appointment.id },
      });

      if (notifications.length > 0) {
        await this.prisma.appointment.update({
          where: { id: appointment.id },
          data: { lastNotifiedAt: new Date() },
        });
        scheduled++;
      }
    }

    this.logger.log(
      `Appointment reminders: ${scheduled} notification(s) scheduled`,
    );
    return scheduled;
  }
}
