import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import {
  type EmailContent,
  passwordResetEmail,
  renderHtml,
  renderText,
  verificationEmail,
} from './mail.templates';

const SMTP_TIMEOUT_MS = 10_000;
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const BREVO_TIMEOUT_MS = 10_000;

/** Separa `"Nome <email@x.com>"` em nome e endereço, como a Brevo pede. */
function parseRemetente(from: string): { name?: string; email: string } {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  if (!match) return { email: from.trim() };
  const name = match[1].trim();
  return name ? { name, email: match[2].trim() } : { email: match[2].trim() };
}

/**
 * Envio de e-mail transacional do fluxo de auth (mobile#54).
 *
 * Com `BREVO_API_KEY`, envia pela API HTTP da Brevo (porta 443): é o caminho
 * para hosts que bloqueiam SMTP de saída, como o Render. Com `SMTP_HOST`,
 * usa SMTP real. Sem nenhum dos dois — o caso de desenvolvimento e da demo —
 * cai no modo de log: o link é escrito no console,
 * o que basta para percorrer verificação de e-mail e recuperação de senha sem
 * depender de um provedor pago.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private brevoApiKey: string | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const brevoApiKey = this.config.get<string>('mail.brevoApiKey');
    if (brevoApiKey) {
      this.brevoApiKey = brevoApiKey;
      this.logger.log('E-mails serão enviados pela API HTTP da Brevo.');
      return;
    }

    const host = this.config.get<string>('mail.smtpHost');
    if (!host) {
      this.logger.warn(
        'SMTP não configurado (SMTP_HOST ausente) — e-mails serão apenas registrados no log.',
      );
      return;
    }

    const user = this.config.get<string>('mail.smtpUser');
    const pass = this.config.get<string>('mail.smtpPass');

    this.transporter = nodemailer.createTransport({
      host,
      port: this.config.get<number>('mail.smtpPort', 587),
      secure: this.config.get<boolean>('mail.smtpSecure', false),
      auth: user && pass ? { user, pass } : undefined,
      // O padrão do nodemailer espera até 2 min por conexão. Com a porta SMTP
      // bloqueada, isso deixava sockets pendurados e mascarava a falha.
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
      // O Render não tem rota IPv6 de saída: o nodemailer tentava o AAAA do
      // Gmail primeiro e falhava com ENETUNREACH. `family` existe no runtime,
      // mas falta nos tipos.
      family: 4,
    } as SMTPTransport.Options);
  }

  /** Link para confirmar o endereço de e-mail da conta. */
  async sendEmailVerification(to: string, token: string): Promise<void> {
    await this.send(
      to,
      verificationEmail(this.buildLink('verify-email', token)),
    );
  }

  /** Link para definir uma nova senha (fluxo "esqueci minha senha"). */
  async sendPasswordReset(to: string, token: string): Promise<void> {
    await this.send(
      to,
      passwordResetEmail(this.buildLink('reset-password', token)),
    );
  }

  /**
   * Monta o link do e-mail sobre a base configurada, que aponta para as
   * páginas servidas pela própria API (`GET /auth/reset-password` e
   * `GET /auth/verify-email`).
   *
   * A base era o scheme do app (`petcard://`), e um scheme customizado não
   * tem dono: no Android, outro app que registre `petcard` pode ser escolhido
   * para abrir o link — com o token de redefinição dentro.
   */
  private buildLink(path: string, token: string): string {
    const base = this.config.get<string>(
      'mail.appLinkBase',
      'http://localhost:3000/auth',
    );
    const separator = base.endsWith('/') ? '' : '/';
    return `${base}${separator}${path}?token=${encodeURIComponent(token)}`;
  }

  private async send(to: string, content: EmailContent): Promise<void> {
    if (this.brevoApiKey) {
      await this.sendViaBrevo(this.brevoApiKey, to, content);
      return;
    }

    if (!this.transporter) {
      this.logger.warn(
        `[MAIL:dev] Para ${to} — ${content.subject}\n  Link: ${content.link}`,
      );
      return;
    }

    await this.transporter.sendMail({
      from: this.config.get<string>('mail.from'),
      to,
      subject: content.subject,
      text: renderText(content),
      html: renderHtml(content),
    });
  }

  /**
   * Envio pela API transacional da Brevo. O remetente (`MAIL_FROM`) precisa
   * estar cadastrado e verificado na conta da Brevo, senão ela recusa o envio.
   * Nunca registra a chave nem o corpo do e-mail: o corpo carrega o token.
   */
  private async sendViaBrevo(
    apiKey: string,
    to: string,
    content: EmailContent,
  ): Promise<void> {
    const from = this.config.get<string>('mail.from', '');
    const response = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: parseRemetente(from),
        to: [{ email: to }],
        subject: content.subject,
        htmlContent: renderHtml(content),
        textContent: renderText(content),
      }),
      signal: AbortSignal.timeout(BREVO_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 200);
      throw new Error(`Brevo respondeu ${response.status}: ${detail}`);
    }
  }
}
