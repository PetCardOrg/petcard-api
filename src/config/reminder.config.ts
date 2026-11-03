import { registerAs } from '@nestjs/config';

/** Piso de entropia do segredo do disparo externo, o mesmo do JWT. */
const MIN_TRIGGER_SECRET_LENGTH = 32;

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true';
}

/**
 * Segredo que o workflow agendado do GitHub Actions manda para disparar os
 * lembretes (AUD API-02). O Render gratuito dorme e o `@Cron` das 9h não roda
 * com o processo parado; sem o segredo o disparo externo não autentica e
 * nenhum lembrete sai. Por isso, em produção, falta dele derruba o boot.
 * Fora de produção, ausente desliga o endpoint.
 */
function parseTriggerSecret(
  raw: string | undefined,
  nodeEnv: string,
): string | undefined {
  const valor = raw?.trim();
  if (!valor) {
    if (nodeEnv === 'production') {
      throw new Error(
        'REMINDERS_TRIGGER_SECRET is required in production. Generate one with: openssl rand -hex 32',
      );
    }
    return undefined;
  }

  if (nodeEnv === 'production' && valor.length < MIN_TRIGGER_SECRET_LENGTH) {
    throw new Error(
      `REMINDERS_TRIGGER_SECRET must be at least ${MIN_TRIGGER_SECRET_LENGTH} characters in production. Generate one with: openssl rand -hex 32`,
    );
  }

  return valor;
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
  triggerSecret: parseTriggerSecret(
    process.env.REMINDERS_TRIGGER_SECRET,
    process.env.NODE_ENV ?? 'development',
  ),
}));
