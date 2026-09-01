import { registerAs } from '@nestjs/config';

const DEFAULT_VERIFICATION_TTL_HOURS = 24;
const DEFAULT_RESET_TTL_MINUTES = 60;
const DEFAULT_APP_LINK_BASE = 'petcard://';
const DEFAULT_FROM = 'PetCard <no-reply@petcard.app>';

function inteiroPositivo(valor: string | undefined, padrao: number): number {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : padrao;
}

/**
 * Envio de e-mail transacional (verificação de conta e recuperação de senha).
 *
 * Sem `SMTP_HOST` o `MailService` cai no modo de log: o link vai para o
 * console em vez de um servidor SMTP. É o suficiente para desenvolvimento e
 * para a demo dos UCs — nenhuma conta paga é necessária. Em produção, definir
 * o bloco SMTP_* faz o envio real.
 */
export const mailConfig = registerAs('mail', () => ({
  smtpHost: process.env.SMTP_HOST,
  smtpPort: inteiroPositivo(process.env.SMTP_PORT, 587),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER,
  // As "senhas de app" do Gmail são exibidas em 4 grupos de 4 com espaços; o
  // valor real não tem espaço. Remover qualquer espaço em branco evita um
  // "auth failed" por causa de um espaço colado sem querer.
  smtpPass: process.env.SMTP_PASS?.replace(/\s+/g, ''),
  from: process.env.MAIL_FROM ?? DEFAULT_FROM,
  // Base dos links dos e-mails. O app mobile registra o scheme `petcard://`;
  // o link vira `petcard://reset-password?token=...`.
  appLinkBase: process.env.APP_DEEP_LINK_BASE ?? DEFAULT_APP_LINK_BASE,
  verificationTtlHours: inteiroPositivo(
    process.env.MAIL_VERIFICATION_TTL_HOURS,
    DEFAULT_VERIFICATION_TTL_HOURS,
  ),
  resetTtlMinutes: inteiroPositivo(
    process.env.MAIL_RESET_TTL_MINUTES,
    DEFAULT_RESET_TTL_MINUTES,
  ),
}));
