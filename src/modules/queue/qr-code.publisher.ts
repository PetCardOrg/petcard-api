import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { QR_CODE_CLIENT, QR_CODE_GENERATE_PATTERN } from './queue.constants';
import { QrCodeGenerateMessage } from './dto/qr-code-generate.message';

@Injectable()
export class QrCodePublisher {
  private readonly logger = new Logger(QrCodePublisher.name);

  constructor(@Inject(QR_CODE_CLIENT) private readonly client: ClientProxy) {}

  async publishGenerate(petId: string): Promise<void> {
    const message: QrCodeGenerateMessage = { pet_id: petId };
    try {
      await lastValueFrom(this.client.emit(QR_CODE_GENERATE_PATTERN, message));
    } catch (error) {
      this.logger.error(
        `Failed to publish qr-code.generate for pet ${petId}`,
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }
}
