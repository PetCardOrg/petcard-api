import { Test, TestingModule } from '@nestjs/testing';
import { RmqContext } from '@nestjs/microservices';
import { CardService } from '../../card/card.service';
import { UploadService } from '../../upload/upload.service';
import { QrCodeConsumer } from '../qr-code.consumer';
import { QR_CODE_MAX_RETRIES, QR_CODE_RETRY_HEADER } from '../queue.constants';

const QR_URL = 'https://bucket.s3.us-east-1.amazonaws.com/qr-codes/pet-1.png';

const buildContext = (
  channel: {
    ack: jest.Mock;
    nack: jest.Mock;
    publish: jest.Mock;
  },
  headers: Record<string, unknown> = {},
) => {
  const message = {
    content: Buffer.from(JSON.stringify({ pet_id: 'pet-1' })),
    fields: { routingKey: 'qr-code.generate' },
    properties: { headers },
  };

  const context = {
    getChannelRef: () => channel,
    getMessage: () => message,
  } as unknown as RmqContext;

  return { context, message };
};

describe('QrCodeConsumer', () => {
  let consumer: QrCodeConsumer;
  let cardService: {
    issueTokenForPet: jest.Mock;
    generateQrCode: jest.Mock;
    setCardQrCodeUrl: jest.Mock;
  };
  let uploadService: { uploadBuffer: jest.Mock };
  let channel: { ack: jest.Mock; nack: jest.Mock; publish: jest.Mock };

  beforeEach(async () => {
    cardService = {
      issueTokenForPet: jest.fn().mockResolvedValue('tok-123'),
      generateQrCode: jest.fn().mockResolvedValue(Buffer.from('fake-png')),
      setCardQrCodeUrl: jest.fn().mockResolvedValue(undefined),
    };
    uploadService = {
      uploadBuffer: jest.fn().mockResolvedValue(QR_URL),
    };
    channel = { ack: jest.fn(), nack: jest.fn(), publish: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QrCodeConsumer,
        { provide: CardService, useValue: cardService },
        { provide: UploadService, useValue: uploadService },
      ],
    }).compile();

    consumer = module.get<QrCodeConsumer>(QrCodeConsumer);
  });

  it('should generate, upload and persist the QR Code, then ack', async () => {
    const { context, message } = buildContext(channel);

    await consumer.handleGenerate({ pet_id: 'pet-1' }, context);

    expect(cardService.issueTokenForPet).toHaveBeenCalledWith('pet-1');
    expect(cardService.generateQrCode).toHaveBeenCalledWith('tok-123');
    expect(uploadService.uploadBuffer).toHaveBeenCalledWith(
      expect.any(Buffer),
      'qr-codes/pet-1.png',
      'image/png',
    );
    expect(cardService.setCardQrCodeUrl).toHaveBeenCalledWith('pet-1', QR_URL);
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
    expect(channel.publish).not.toHaveBeenCalled();
  });

  it('should ack and skip when pet_id is missing', async () => {
    const { context, message } = buildContext(channel);

    await consumer.handleGenerate({} as unknown as { pet_id: string }, context);

    expect(cardService.issueTokenForPet).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('should republish with incremented retry counter on first failure', async () => {
    cardService.issueTokenForPet.mockRejectedValue(new Error('DB down'));
    const { context, message } = buildContext(channel);

    await consumer.handleGenerate({ pet_id: 'pet-1' }, context);

    expect(channel.publish).toHaveBeenCalledWith(
      '',
      'qr-code.generate',
      message.content,
      expect.objectContaining({
        headers: expect.objectContaining({
          [QR_CODE_RETRY_HEADER]: 1,
        }) as unknown,
      }),
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('should increment existing retry counter on subsequent failures', async () => {
    cardService.issueTokenForPet.mockRejectedValue(new Error('DB down'));
    const { context } = buildContext(channel, { [QR_CODE_RETRY_HEADER]: 1 });

    await consumer.handleGenerate({ pet_id: 'pet-1' }, context);

    expect(channel.publish).toHaveBeenCalledWith(
      '',
      'qr-code.generate',
      expect.any(Buffer),
      expect.objectContaining({
        headers: expect.objectContaining({
          [QR_CODE_RETRY_HEADER]: 2,
        }) as unknown,
      }),
    );
  });

  it('should nack without requeue (route to DLQ) when retries are exhausted', async () => {
    cardService.issueTokenForPet.mockRejectedValue(new Error('DB down'));
    const { context, message } = buildContext(channel, {
      [QR_CODE_RETRY_HEADER]: QR_CODE_MAX_RETRIES,
    });

    await consumer.handleGenerate({ pet_id: 'pet-1' }, context);

    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(channel.publish).not.toHaveBeenCalled();
    expect(channel.ack).not.toHaveBeenCalled();
  });
});
