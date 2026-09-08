/**
 * Formatação e comparação de datas no fuso do tutor.
 *
 * A API guarda instantes (UTC) e o tutor lê datas de calendário: "próxima dose
 * em 12/03" só é verdade dentro de um fuso. Enquanto o fuso era fixo em
 * `America/Fortaleza`, tutor em outro fuso via a data errada na virada do dia —
 * e a contagem de "próximas doses" da carteira errava junto, porque comparava
 * com a meia-noite do processo, não com a do tutor.
 *
 * `Tutor.timezone` existe no schema desde a integração com o Google Calendar;
 * aqui ele passa a valer também para lembrete e carteira. O horário em que o
 * cron dispara continua fixo — o que precisa respeitar o tutor é o texto que
 * ele lê e a comparação de datas, não o instante da varredura.
 */
export const DEFAULT_TIMEZONE = 'America/Fortaleza';

export function resolveTimeZone(timeZone?: string | null): string {
  return timeZone ?? DEFAULT_TIMEZONE;
}

/** Data (dd/mm/aaaa) como o tutor a vê no fuso dele. */
export function formatDateInTimeZone(
  date: Date,
  timeZone?: string | null,
): string {
  return date.toLocaleDateString('pt-BR', {
    timeZone: resolveTimeZone(timeZone),
  });
}

/** Data e hora curtas no fuso do tutor. */
export function formatDateTimeInTimeZone(
  date: Date,
  timeZone?: string | null,
): string {
  return date.toLocaleString('pt-BR', {
    timeZone: resolveTimeZone(timeZone),
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

/**
 * Dia civil no formato `AAAA-MM-DD` dentro do fuso informado. `en-CA` é o
 * locale que produz ISO — ordem lexicográfica e cronológica coincidem, o que
 * deixa a comparação de dias ser uma comparação de strings.
 */
function civilDay(date: Date, timeZone: string): string {
  return date.toLocaleDateString('en-CA', { timeZone });
}

/** True quando `date` cai hoje ou depois de hoje, no calendário do tutor. */
export function isFutureOrTodayInTimeZone(
  date: Date | null | undefined,
  timeZone?: string | null,
  now: Date = new Date(),
): boolean {
  if (!date) return false;
  const zone = resolveTimeZone(timeZone);
  return civilDay(date, zone) >= civilDay(now, zone);
}
