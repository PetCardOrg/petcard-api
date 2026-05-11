import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { QrCodePublisher } from '../qr-code.publisher';
import { QR_CODE_CLIENT, QR_CODE_GENERATE_PATTERN } from '../queue.constants';

describe('QrCodePublisher', () => {
  let publisher: QrCodePublisher;
  let client: { emit: jest.Mock };

  beforeEach(async () => {
    client = { emit: jest.fn().mockReturnValue(of(undefined)) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QrCodePublisher,
        { provide: QR_CODE_CLIENT, useValue: client as unknown },
      ],
    }).compile();

    publisher = module.get<QrCodePublisher>(QrCodePublisher);
  });

  it('should emit a qr-code.generate event with the pet_id', async () => {
    await publisher.publishGenerate('pet-42');

    expect(client.emit).toHaveBeenCalledWith(QR_CODE_GENERATE_PATTERN, {
      pet_id: 'pet-42',
    });
  });

  it('should swallow publish errors so the caller is not impacted', async () => {
    client.emit.mockReturnValue(throwError(() => new Error('rmq down')));

    await expect(publisher.publishGenerate('pet-42')).resolves.toBeUndefined();
  });
});
