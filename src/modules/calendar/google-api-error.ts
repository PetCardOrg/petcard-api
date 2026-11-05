/**
 * Helpers para classificar erros da API do Google Calendar.
 *
 * O cliente do Google (`@googleapis/calendar`) expõe o status ora em `code`,
 * ora em `response.status`, dependendo do caminho que levantou o erro.
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

/**
 * O Google recusou a credencial do tutor de forma definitiva: o refresh token
 * foi revogado ou expirou (comum em app no modo "Testando", que vence em 7
 * dias). Repetir não adianta; só reconectar resolve.
 */
export function isPermanentAuthError(error: unknown): boolean {
  if (extractGoogleStatus(error) === 401) return true;
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('invalid_grant') ||
    message.includes('token has been expired or revoked')
  );
}
