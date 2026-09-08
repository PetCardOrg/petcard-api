import { registerAs } from '@nestjs/config';

const DEFAULT_VERIFICATION_TTL_HOURS = 24;
const DEFAULT_RESET_TTL_MINUTES = 60;
const DEFAULT_APP_LINK_BASE = 'http://localhost:3000/auth';
const DEFAULT_FROM = 'PetCard <no-reply@petcard.app>';

function inteiroPositivo(valor: string | undefined, padrao: number): number {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : padrao;
}

/**
 * Base dos links dos e-mails de auth.
 *
 * Apontava para `petcard://`, o scheme customizado do app. Scheme customizado
 * não tem dono: qualquer app instalado pode registrar `petcard` e, no Android,
 * ser escolhido para abrir o link — junto com o token de redefinição que vai
 * nele. Sem App Links / Universal Links verificados por domínio, não há como
 * garantir que o link do e-mail chegue ao PetCard.
 *
 * Agora aponta para as páginas que a própria API serve
 * (`GET /auth/reset-password` e `GET /auth/verify-email`): https, origem
 * verificada pelo navegador, e o token não passa por app nenhum. Em produção
 * é obrigatório — o default é um endereço de desenvolvimento, e mandá-lo num
 * e-mail de verdade é um link morto.
 */
function parseAppLinkBase(raw: string | undefined, nodeEnv: string): string {
  if (raw && raw.trim().length > 0) {
    return raw.trim();
  }

  if (nodeEnv === 'production') {
    throw new Error(
      'APP_DEEP_LINK_BASE is required in production. Point it at the public API base + /auth (e.g. https://api.petcard.app/auth).',
    );
  }

  return DEFAULT_APP_LINK_BASE;
}

/**
 * Em produção, faltar `SMTP_HOST` não é uma configuração incompleta — é uma
 * falha de segurança silenciosa.
 *
 * Sem host, o `MailService` cai no modo de log e escreve o link de
 * redefinição, com o token dentro, na saída do processo: no CloudWatch, em
 * texto claro, para quem tiver acesso aos logs. Ao mesmo tempo, nenhum e-mail
 * chega ao usuário, então ninguém percebe. Mesma escolha do `JWT_SECRET` e do
 * `CORS_ORIGINS`: em produção, faltar = não sobe.
 */
function parseSmtpHost(
  raw: string | undefined,
  nodeEnv: string,
): string | undefined {
  if (raw && raw.trim().length > 0) {
    return raw.trim();
  }

  if (nodeEnv === 'production') {
    throw new Error(
      'SMTP_HOST is required in production. Without it the reset link is written to the logs and no email is ever sent.',
    );
  }

  return undefined;
}

/**
 * Envio de e-mail transacional (verificação de conta e recuperação de senha).
 *
 * Sem `SMTP_HOST` o `MailService` cai no modo de log: o link vai para o
 * console em vez de um servidor SMTP. É o suficiente para desenvolvimento e
 * para a demo dos UCs — nenhuma conta paga é necessária. Em produção o bloco
 * SMTP_* é obrigatório e o boot falha sem ele.
 */
export const mailConfig = registerAs('mail', () => ({
  smtpHost: parseSmtpHost(
    process.env.SMTP_HOST,
    process.env.NODE_ENV ?? 'development',
  ),
  smtpPort: inteiroPositivo(process.env.SMTP_PORT, 587),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER,
  // As "senhas de app" do Gmail são exibidas em 4 grupos de 4 com espaços; o
  // valor real não tem espaço. Remover qualquer espaço em branco evita um
  // "auth failed" por causa de um espaço colado sem querer.
  smtpPass: process.env.SMTP_PASS?.replace(/\s+/g, ''),
  from: process.env.MAIL_FROM ?? DEFAULT_FROM,
  // Base dos links dos e-mails, apontando para as páginas que a própria API
  // serve: o link vira `<base>/reset-password?token=...`.
  appLinkBase: parseAppLinkBase(
    process.env.APP_DEEP_LINK_BASE,
    process.env.NODE_ENV ?? 'development',
  ),
  verificationTtlHours: inteiroPositivo(
    process.env.MAIL_VERIFICATION_TTL_HOURS,
    DEFAULT_VERIFICATION_TTL_HOURS,
  ),
  resetTtlMinutes: inteiroPositivo(
    process.env.MAIL_RESET_TTL_MINUTES,
    DEFAULT_RESET_TTL_MINUTES,
  ),
}));
