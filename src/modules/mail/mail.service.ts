import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  type EmailContent,
  passwordResetEmail,
  renderHtml,
  renderText,
  verificationEmail,
} from './mail.templates';

/**
 * Envio de e-mail transacional do fluxo de auth (mobile#54).
 *
 * Com `SMTP_HOST` configurado, usa SMTP real. Sem ele — o caso de
 * desenvolvimento e da demo — cai no modo de log: o link é escrito no console,
 * o que basta para percorrer verificação de e-mail e recuperação de senha sem
 * depender de um provedor pago.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
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
    });
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

  private buildLink(path: string, token: string): string {
    const base = this.config.get<string>('mail.appLinkBase', 'petcard://');
    const separator = base.endsWith('/') || base.endsWith('://') ? '' : '/';
    return `${base}${separator}${path}?token=${encodeURIComponent(token)}`;
  }

  private async send(to: string, content: EmailContent): Promise<void> {
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
}
