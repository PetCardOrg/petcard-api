import { Controller, Logger } from '@nestjs/common';
import { Ctx, MessagePattern, Payload } from '@nestjs/microservices';
import type { RmqContext } from '@nestjs/microservices';
import type { Channel, ConsumeMessage } from 'amqplib';
import { CardService } from '../card/card.service';
import { UploadService } from '../upload/upload.service';
import type { QrCodeGenerateMessage } from './dto/qr-code-generate.message';
import {
  QR_CODE_GENERATE_PATTERN,
  QR_CODE_MAX_RETRIES,
  QR_CODE_RETRY_HEADER,
} from './queue.constants';

@Controller()
export class QrCodeConsumer {
  private readonly logger = new Logger(QrCodeConsumer.name);

  constructor(
    private readonly cardService: CardService,
    private readonly uploadService: UploadService,
  ) {}

  @MessagePattern(QR_CODE_GENERATE_PATTERN)
  async handleGenerate(
    @Payload() data: QrCodeGenerateMessage,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef() as Channel;
    const originalMessage = context.getMessage() as ConsumeMessage;
    const petId = data?.pet_id;

    if (!petId) {
      this.logger.warn('Received qr-code.generate message without pet_id');
      channel.ack(originalMessage);
      return;
    }

    try {
      const token = await this.cardService.issueTokenForPet(petId);
      const buffer = await this.cardService.generateQrCode(token);
      const url = await this.uploadService.uploadBuffer(
        buffer,
        `qr-codes/${petId}.png`,
        'image/png',
      );
      await this.cardService.setCardQrCodeUrl(petId, url);
      this.logger.log(`QR Code generated for pet ${petId}`);
      channel.ack(originalMessage);
    } catch (error) {
      const retryCount = this.getRetryCount(originalMessage);

      if (retryCount < QR_CODE_MAX_RETRIES) {
        this.logger.warn(
          `Retry ${retryCount + 1}/${QR_CODE_MAX_RETRIES} for pet ${petId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        channel.publish(
          '',
          originalMessage.fields.routingKey,
          originalMessage.content,
          {
            ...originalMessage.properties,
            headers: {
              ...originalMessage.properties.headers,
              [QR_CODE_RETRY_HEADER]: retryCount + 1,
            },
          },
        );
        channel.ack(originalMessage);
        return;
      }

      this.logger.error(
        `Exhausted retries for pet ${petId}, routing to DLQ`,
        error instanceof Error ? error.stack : error,
      );
      channel.nack(originalMessage, false, false);
    }
  }

  private getRetryCount(message: ConsumeMessage): number {
    const raw: unknown = message.properties.headers?.[QR_CODE_RETRY_HEADER];
    return typeof raw === 'number' ? raw : 0;
  }
}
