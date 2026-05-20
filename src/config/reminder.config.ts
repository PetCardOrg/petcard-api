import { registerAs } from '@nestjs/config';

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true';
}

export const reminderConfig = registerAs('reminder', () => ({
  enabled: parseBool(process.env.DOSE_REMINDER_ENABLED, true),
  windowDays: Number(process.env.DOSE_REMINDER_WINDOW_DAYS ?? 3),
}));
