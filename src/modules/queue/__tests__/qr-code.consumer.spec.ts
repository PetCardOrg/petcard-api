import { Test, TestingModule } from '@nestjs/testing';
import { RmqContext } from '@nestjs/microservices';
import { CardService } from '../../card/card.service';
import { ColeiraService } from '../../coleira/coleira.service';
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
    ensureTokenForPet: jest.Mock;
    generateQrCode: jest.Mock;
    setCardQrCodeUrl: jest.Mock;
  };
  let coleiraService: {
    ensureTokenForPet: jest.Mock;
    generateQrCode: jest.Mock;
    setQrCodeUrl: jest.Mock;
  };
  let uploadService: { uploadBuffer: jest.Mock };
  let channel: { ack: jest.Mock; nack: jest.Mock; publish: jest.Mock };

  beforeEach(async () => {
    cardService = {
      ensureTokenForPet: jest.fn().mockResolvedValue('tok-123'),
      generateQrCode: jest.fn().mockResolvedValue(Buffer.from('fake-png')),
      setCardQrCodeUrl: jest.fn().mockResolvedValue(undefined),
    };
    coleiraService = {
      ensureTokenForPet: jest.fn().mockResolvedValue('coleira-tok'),
      generateQrCode: jest.fn().mockResolvedValue(Buffer.from('fake-png')),
      setQrCodeUrl: jest.fn().mockResolvedValue(undefined),
    };
    uploadService = {
      uploadBuffer: jest.fn().mockResolvedValue(QR_URL),
    };
    channel = { ack: jest.fn(), nack: jest.fn(), publish: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QrCodeConsumer,
        { provide: CardService, useValue: cardService },
        { provide: ColeiraService, useValue: coleiraService },
        { provide: UploadService, useValue: uploadService },
      ],
    }).compile();

    consumer = module.get<QrCodeConsumer>(QrCodeConsumer);
  });

  it('should generate, upload and persist the QR Code, then ack', async () => {
    const { context, message } = buildContext(channel);

    await consumer.handleGenerate({ pet_id: 'pet-1' }, context);

    expect(cardService.ensureTokenForPet).toHaveBeenCalledWith('pet-1');
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

  // A regressão que este teste pega: quando o handler emitia o token
  // (`issueTokenForPet`, upsert com `update: { token }`), uma falha transitória
  // no S3 fazia o retry rotacionar carteira e coleira de novo — o QR já
  // impresso na coleira passava a apontar para um token inexistente e a página
  // do achador respondia 404.
  it('não troca os tokens quando o job é reexecutado depois de uma falha', async () => {
    // Os serviços devolvem sempre o token que já está no banco.
    cardService.ensureTokenForPet.mockResolvedValue('tok-carteira');
    coleiraService.ensureTokenForPet.mockResolvedValue('tok-coleira');
    // Primeira execução morre no upload; a segunda (retry) vai até o fim.
    uploadService.uploadBuffer
      .mockRejectedValueOnce(new Error('S3 timeout'))
      .mockResolvedValue(QR_URL);

    const primeira = buildContext(channel);
    await consumer.handleGenerate({ pet_id: 'pet-1' }, primeira.context);

    const retry = buildContext(channel, { [QR_CODE_RETRY_HEADER]: 1 });
    await consumer.handleGenerate({ pet_id: 'pet-1' }, retry.context);

    // As duas execuções desenharam o MESMO token, nas duas pontas.
    expect(cardService.generateQrCode.mock.calls).toEqual([
      ['tok-carteira'],
      ['tok-carteira'],
    ]);
    expect(coleiraService.generateQrCode.mock.calls).toEqual([['tok-coleira']]);
    // E a imagem vai para a mesma chave do S3, não para uma nova.
    expect(uploadService.uploadBuffer).toHaveBeenCalledWith(
      expect.any(Buffer),
      'qr-codes/pet-1.png',
      'image/png',
    );
    expect(coleiraService.setQrCodeUrl).toHaveBeenCalledWith('pet-1', QR_URL);
  });

  it('should ack and skip when pet_id is missing', async () => {
    const { context, message } = buildContext(channel);

    await consumer.handleGenerate({} as unknown as { pet_id: string }, context);

    expect(cardService.ensureTokenForPet).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('should republish with incremented retry counter on first failure', async () => {
    cardService.ensureTokenForPet.mockRejectedValue(new Error('DB down'));
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
    cardService.ensureTokenForPet.mockRejectedValue(new Error('DB down'));
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
    cardService.ensureTokenForPet.mockRejectedValue(new Error('DB down'));
    const { context, message } = buildContext(channel, {
      [QR_CODE_RETRY_HEADER]: QR_CODE_MAX_RETRIES,
    });

    await consumer.handleGenerate({ pet_id: 'pet-1' }, context);

    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(channel.publish).not.toHaveBeenCalled();
    expect(channel.ack).not.toHaveBeenCalled();
  });
});
