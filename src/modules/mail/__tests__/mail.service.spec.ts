import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as nodemailer from 'nodemailer';
import { MailService } from '../mail.service';

jest.mock('nodemailer');

describe('MailService', () => {
  const sendMail = jest.fn().mockResolvedValue({ messageId: 'x' });

  async function buildService(
    values: Record<string, unknown>,
  ): Promise<MailService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(
              (key: string, fallback?: unknown) => values[key] ?? fallback,
            ),
          },
        },
      ],
    }).compile();

    const service = module.get(MailService);
    service.onModuleInit();
    return service;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
  });

  it('sem SMTP configurado, registra o link no log e não abre transporte', async () => {
    const service = await buildService({
      'mail.appLinkBase': 'https://api.petcard.app/auth',
    });
    const warn = jest
      .spyOn(service['logger'], 'warn')
      .mockImplementation(() => undefined);

    await service.sendPasswordReset('alice@example.com', 'tok-123');

    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'https://api.petcard.app/auth/reset-password?token=tok-123',
      ),
    );
  });

  it('com SMTP configurado, envia via transporte', async () => {
    const service = await buildService({
      'mail.smtpHost': 'smtp.example.com',
      'mail.smtpPort': 587,
      'mail.appLinkBase': 'https://api.petcard.app/auth',
      'mail.from': 'PetCard <no-reply@petcard.app>',
    });

    await service.sendEmailVerification('bob@example.com', 'tok-abc');

    expect(sendMail).toHaveBeenCalledTimes(1);
    const [payload] = sendMail.mock.calls[0] as [
      { to: string; subject: string; html: string },
    ];
    expect(payload.to).toBe('bob@example.com');
    expect(payload.html).toContain(
      'https://api.petcard.app/auth/verify-email?token=tok-abc',
    );
  });

  it('o link nunca sai num scheme customizado', async () => {
    const service = await buildService({
      'mail.smtpHost': 'smtp.example.com',
      'mail.appLinkBase': 'https://api.petcard.app/auth',
    });

    await service.sendPasswordReset('alice@example.com', 'tok-123');

    // `petcard://` não tem dono: qualquer app pode registrar o scheme e, no
    // Android, ser escolhido para abrir o link — levando o token junto.
    const [payload] = sendMail.mock.calls[0] as [
      { text: string; html: string },
    ];
    expect(payload.text).not.toContain('petcard://');
    expect(payload.html).not.toContain('petcard://');
    expect(payload.text).toContain('https://api.petcard.app/auth');
  });

  describe('com a API HTTP da Brevo', () => {
    const fetchMock = jest.fn();

    beforeEach(() => {
      fetchMock.mockReset();
      jest.spyOn(global, 'fetch').mockImplementation(fetchMock);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    const values = {
      'mail.brevoApiKey': 'xkeysib-teste',
      'mail.smtpHost': 'smtp.example.com',
      'mail.appLinkBase': 'https://api.petcard.app/auth',
      'mail.from': 'PetCard <no-reply@petcard.app>',
    };

    it('envia por HTTPS com a chave no header e não abre SMTP', async () => {
      fetchMock.mockResolvedValue({ ok: true });
      const service = await buildService(values);

      await service.sendEmailVerification('bob@example.com', 'tok-abc');

      expect(nodemailer.createTransport).not.toHaveBeenCalled();
      const [url, init] = fetchMock.mock.calls[0] as [
        string,
        { headers: Record<string, string>; body: string },
      ];
      expect(url).toBe('https://api.brevo.com/v3/smtp/email');
      expect(init.headers['api-key']).toBe('xkeysib-teste');
      const body = JSON.parse(init.body) as {
        sender: { name: string; email: string };
        to: { email: string }[];
        htmlContent: string;
      };
      expect(body.sender).toEqual({
        name: 'PetCard',
        email: 'no-reply@petcard.app',
      });
      expect(body.to).toEqual([{ email: 'bob@example.com' }]);
      expect(body.htmlContent).toContain(
        'https://api.petcard.app/auth/verify-email?token=tok-abc',
      );
    });

    it('falha quando a Brevo recusa, sem vazar a chave na mensagem', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('{"message":"Key not found"}'),
      });
      const service = await buildService(values);

      const error = await service
        .sendPasswordReset('bob@example.com', 'tok-1')
        .catch((e: Error) => e);

      expect((error as Error).message).toMatch(/Brevo respondeu 401/);
      expect((error as Error).message).not.toContain('xkeysib-teste');
    });
  });
});
