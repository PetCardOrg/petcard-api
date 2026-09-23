import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DEFAULT_TIMEZONE,
  formatDateTimeInTimeZone,
} from '../../common/time/timezone';
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
 *
 * Como o lembrete de dose, o registro é reivindicado antes do envio: cada
 * processo roda o próprio `@Cron` e a Fase 2 da M7 sobe mais de uma task no
 * ECS — sem isso, duas instâncias selecionam o mesmo agendamento às 9h e o
 * tutor recebe o aviso duas vezes.
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
    timeZone: DEFAULT_TIMEZONE,
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
      include: {
        pet: { select: { name: true } },
        tutor: { select: { timezone: true } },
      },
    });

    let scheduled = 0;
    for (const appointment of appointments) {
      // Claim: o UPDATE condicionado a `lastNotifiedAt: null` é atômico, então
      // de duas instâncias que leram o mesmo agendamento só uma vê count = 1 e
      // segue para o push.
      const { count } = await this.prisma.appointment.updateMany({
        where: { id: appointment.id, lastNotifiedAt: null },
        data: { lastNotifiedAt: new Date() },
      });
      if (count === 0) {
        this.logger.debug(
          `Agendamento ${appointment.id} já reivindicado por outra instância; pulando`,
        );
        continue;
      }

      // Horário como o tutor o lê: o mesmo instante é 19h para um e 21h para
      // outro, e o aviso serve justamente para ele se organizar no dia dele.
      const when = formatDateTimeInTimeZone(
        appointment.scheduledAt,
        appointment.tutor?.timezone,
      );
      const label = appointment.pet?.name
        ? `${appointment.pet.name}: consulta "${appointment.title}" marcada para ${when}.`
        : `Consulta "${appointment.title}" marcada para ${when}.`;

      let notifications: unknown[] = [];
      try {
        notifications = await this.notificationService.schedulePush({
          tutorId: appointment.tutorId,
          appointmentId: appointment.id,
          kind: NotificationKind.APPOINTMENT_REMINDER,
          referenceType: 'APPOINTMENT',
          referenceId: appointment.id,
          title: 'Consulta chegando',
          body: label,
          data: { reference_type: 'APPOINTMENT', reference_id: appointment.id },
        });
      } finally {
        // Sem device token nada foi enviado: solta a reivindicação para o
        // tutor que registrar um aparelho ainda receber o aviso.
        if (notifications.length === 0) {
          await this.prisma.appointment.update({
            where: { id: appointment.id },
            data: { lastNotifiedAt: null },
          });
        }
      }

      if (notifications.length > 0) scheduled++;
    }

    this.logger.log(
      `Appointment reminders: ${scheduled} notification(s) scheduled`,
    );
    return scheduled;
  }
}
