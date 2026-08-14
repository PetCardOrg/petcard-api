/**
 * Helpers para classificar erros da API do Google Calendar.
 *
 * O `googleapis` expõe o status ora em `code`, ora em `response.status`,
 * dependendo do caminho que levantou o erro.
 */
export function extractGoogleStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const err = error as { code?: unknown; response?: { status?: unknown } };
  if (typeof err.code === 'number') return err.code;
  const status = err.response?.status;
  return typeof status === 'number' ? status : undefined;
}

/**
 * O evento não está mais lá: `404` (nunca existiu) ou `410` (existia e já foi
 * apagado — o Google responde "Resource has been deleted"). Para UPDATE/DELETE
 * os dois casos significam que o estado desejado já vale, então a operação é
 * idempotente e não deve ser repetida nem mandada para a DLQ.
 */
export function isAlreadyGoneError(error: unknown): boolean {
  const status = extractGoogleStatus(error);
  return status === 404 || status === 410;
}
