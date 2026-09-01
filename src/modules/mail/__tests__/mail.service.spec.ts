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
    const service = await buildService({ 'mail.appLinkBase': 'petcard://' });
    const warn = jest
      .spyOn(service['logger'], 'warn')
      .mockImplementation(() => undefined);

    await service.sendPasswordReset('alice@example.com', 'tok-123');

    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('petcard://reset-password?token=tok-123'),
    );
  });

  it('com SMTP configurado, envia via transporte', async () => {
    const service = await buildService({
      'mail.smtpHost': 'smtp.example.com',
      'mail.smtpPort': 587,
      'mail.appLinkBase': 'petcard://',
      'mail.from': 'PetCard <no-reply@petcard.app>',
    });

    await service.sendEmailVerification('bob@example.com', 'tok-abc');

    expect(sendMail).toHaveBeenCalledTimes(1);
    const [payload] = sendMail.mock.calls[0] as [
      { to: string; subject: string; html: string },
    ];
    expect(payload.to).toBe('bob@example.com');
    expect(payload.html).toContain('petcard://verify-email?token=tok-abc');
  });
});
