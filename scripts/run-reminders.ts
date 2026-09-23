import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AppointmentReminderService } from '../src/modules/reminder/appointment-reminder.service';
import { DoseReminderService } from '../src/modules/reminder/dose-reminder.service';

/**
 * Dispara agora os lembretes que o cron rodaria às 9h (api#111) — para demo e
 * evidência de UC (PC-094), sem esperar o horário nem depender de endpoint.
 *
 * Uso: `npm run reminders:run` (precisa do Postgres de dev no ar).
 * Cria as linhas em `notification` e carimba `last_notified_at` nos registros
 * que estão na janela. Rodar de novo não duplica (idempotente).
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const dose = app.get(DoseReminderService);
  const appointment = app.get(AppointmentReminderService);

  const doseResult = await dose.runDoseReminders();
  const appointmentCount = await appointment.runAppointmentReminders();

  console.log('\n--- Lembretes disparados ---');
  console.log(`vacina:       ${doseResult.vaccine}`);
  console.log(`vermifugo:    ${doseResult.deworming}`);
  console.log(`medicacao:    ${doseResult.medication}`);
  console.log(`agendamento:  ${appointmentCount}`);

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
