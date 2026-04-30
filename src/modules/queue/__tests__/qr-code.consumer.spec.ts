import { Test, TestingModule } from '@nestjs/testing';
import { RmqContext } from '@nestjs/microservices';
import { CardService } from '../../card/card.service';
import { UploadService } from '../../upload/upload.service';
import { QrCodeConsumer } from '../qr-code.consumer';

describe('QrCodeConsumer', () => {
  let consumer: QrCodeConsumer;
  let cardService: {
    issueTokenForPet: jest.Mock;
    generateQrCode: jest.Mock;
    setCardQrCodeUrl: jest.Mock;
  };
  let uploadService: { uploadBuffer: jest.Mock };
  let channel: { ack: jest.Mock; nack: jest.Mock };
  let context: RmqContext;
  const message = {} as unknown;
  const QR_URL = 'https://bucket.s3.us-east-1.amazonaws.com/qr-codes/pet-1.png';

  beforeEach(async () => {
    cardService = {
      issueTokenForPet: jest.fn().mockResolvedValue('tok-123'),
      generateQrCode: jest.fn().mockResolvedValue(Buffer.from('fake-png')),
      setCardQrCodeUrl: jest.fn().mockResolvedValue(undefined),
    };
    uploadService = {
      uploadBuffer: jest.fn().mockResolvedValue(QR_URL),
    };
    channel = { ack: jest.fn(), nack: jest.fn() };
    context = {
      getChannelRef: () => channel,
      getMessage: () => message,
    } as unknown as RmqContext;

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
  });

  it('should ack and skip when pet_id is missing', async () => {
    await consumer.handleGenerate({} as unknown as { pet_id: string }, context);

    expect(cardService.issueTokenForPet).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('should nack without requeue when processing fails', async () => {
    cardService.issueTokenForPet.mockRejectedValue(new Error('DB down'));

    await consumer.handleGenerate({ pet_id: 'pet-1' }, context);

    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
  });
});
