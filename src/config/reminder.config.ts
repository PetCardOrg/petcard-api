import { registerAs } from '@nestjs/config';

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true';
}

export const reminderConfig = registerAs('reminder', () => ({
  enabled: parseBool(process.env.DOSE_REMINDER_ENABLED, true),
  windowDays: Number(process.env.DOSE_REMINDER_WINDOW_DAYS ?? 3),
  // Lembrete de agendamento (api#111) — janela em horas, não dias: é um único
  // aviso próximo do horário da consulta, não uma dose que se repete.
  appointmentEnabled: parseBool(process.env.APPOINTMENT_REMINDER_ENABLED, true),
  appointmentWindowHours: Number(
    process.env.APPOINTMENT_REMINDER_WINDOW_HOURS ?? 24,
  ),
}));
