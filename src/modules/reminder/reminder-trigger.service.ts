import { Injectable, Logger } from '@nestjs/common';
import { DEFAULT_TIMEZONE } from '../../common/time/timezone';
import { AppointmentReminderService } from './appointment-reminder.service';
import { DoseReminderService } from './dose-reminder.service';

/** Janela, em horas do fuso padrão, em que o boot pode mandar lembrete. */
const BOOT_RUN_FROM_HOUR = 9;
const BOOT_RUN_UNTIL_HOUR = 21;

/**
 * Disparos dos lembretes fora do `@Cron` (AUD API-02).
 *
 * No plano gratuito do Render o processo dorme e o `@Cron` das 9h não roda.
 * Os lembretes passam a sair por dois caminhos extras: o workflow agendado do
 * GitHub Actions (`reminders.yml`), que chama `POST /internal/reminders/run`,
 * e uma execução logo depois do `listen`, que cobre o atraso ou a falha do
 * agendamento do GitHub. Repetir é seguro: cada registro é reivindicado antes
 * do envio, então rodar de novo no mesmo dia não duplica push.
 */
@Injectable()
export class ReminderTriggerService {
  private readonly logger = new Logger(ReminderTriggerService.name);

  constructor(
    private readonly dose: DoseReminderService,
    private readonly appointment: AppointmentReminderService,
  ) {}

  /** Roda os dois lembretes; a falha de um não impede o outro. */
  async runAll(): Promise<void> {
    const results = await Promise.allSettled([
      this.dose.handleCron(),
      this.appointment.handleCron(),
    ]);
    const failed = results.find((r) => r.status === 'rejected');
    if (failed) {
      throw failed.reason instanceof Error
        ? failed.reason
        : new Error(String(failed.reason));
    }
  }

  /**
   * Execução no boot. Só de dia: o servidor também acorda de madrugada
   * (basta alguém abrir o app), e lembrete às 2h incomoda mais que ajuda. O
   * disparo das 9h do dia seguinte cobre o que ficar de fora.
   */
  async runOnBoot(now: Date = new Date()): Promise<void> {
    const hour = Number(
      now.toLocaleString('en-US', {
        timeZone: DEFAULT_TIMEZONE,
        hour: 'numeric',
        hourCycle: 'h23',
      }),
    );
    if (hour < BOOT_RUN_FROM_HOUR || hour >= BOOT_RUN_UNTIL_HOUR) {
      this.logger.log(
        `Boot às ${hour}h (${DEFAULT_TIMEZONE}): lembretes ficam para o disparo das 9h`,
      );
      return;
    }

    try {
      await this.runAll();
    } catch (error) {
      this.logger.error(
        'Falha ao rodar os lembretes no boot',
        error instanceof Error ? error.stack : error,
      );
    }
  }
}
