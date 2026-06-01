import { Controller, Logger } from '@nestjs/common';
import { Ctx, MessagePattern, Payload } from '@nestjs/microservices';
import type { RmqContext } from '@nestjs/microservices';
import type { Channel, ConsumeMessage } from 'amqplib';
import type { NotificationPushMessage } from '../queue/dto/notification-push.message';
import {
  NOTIFICATION_PUSH_MAX_RETRIES,
  NOTIFICATION_PUSH_PATTERN,
  NOTIFICATION_PUSH_RETRY_HEADER,
} from '../queue/queue.constants';
import { FcmClient } from './fcm.client';
import { NotificationService } from './notification.service';

@Controller()
export class NotificationPushConsumer {
  private readonly logger = new Logger(NotificationPushConsumer.name);

  /** FCM error codes that mean the device token is permanently dead. */
  private static readonly UNREGISTERED_TOKEN_CODES = new Set([
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token',
  ]);

  constructor(
    private readonly fcmClient: FcmClient,
    private readonly notificationService: NotificationService,
  ) {}

  @MessagePattern(NOTIFICATION_PUSH_PATTERN)
  async handlePush(
    @Payload() data: NotificationPushMessage,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef() as Channel;
    const originalMessage = context.getMessage() as ConsumeMessage;
    const notificationId = data?.notification_id;

    if (!notificationId || !data?.device_token) {
      this.logger.warn(
        'Received notification.push message without notification_id/device_token',
      );
      channel.ack(originalMessage);
      return;
    }

    try {
      const result = await this.fcmClient.send(data.device_token, {
        title: data.title,
        body: data.body,
        data: data.data,
      });

      if (result.errorCode) {
        // A dead token never recovers — soft-invalidate it instead of retrying.
        if (this.isUnregisteredTokenError(result.errorCode)) {
          await this.notificationService.deleteByToken(data.device_token);
          await this.notificationService.markFailed(
            notificationId,
            result.errorCode,
          );
          this.logger.warn(
            `Stale device token removed for notification ${notificationId} (code=${result.errorCode})`,
          );
          channel.ack(originalMessage);
          return;
        }
        // Transient FCM error — retry, then DLQ.
        await this.retryOrDlq(
          notificationId,
          result.errorCode,
          channel,
          originalMessage,
        );
        return;
      }

      // Success (messageId is absent when FCM is disabled in dev — still SENT).
      await this.notificationService.markSent(notificationId, result.messageId);
      this.logger.log(`Push delivered for notification ${notificationId}`);
      channel.ack(originalMessage);
    } catch (error) {
      // Unexpected failure (e.g. DB update) — retry, then DLQ.
      const reason = error instanceof Error ? error.message : String(error);
      await this.retryOrDlq(notificationId, reason, channel, originalMessage);
    }
  }

  private async retryOrDlq(
    notificationId: string,
    errorCode: string,
    channel: Channel,
    message: ConsumeMessage,
  ): Promise<void> {
    const retryCount = this.getRetryCount(message);

    if (retryCount < NOTIFICATION_PUSH_MAX_RETRIES) {
      this.logger.warn(
        `Retry ${retryCount + 1}/${NOTIFICATION_PUSH_MAX_RETRIES} for notification ${notificationId}: ${errorCode}`,
      );
      channel.publish('', message.fields.routingKey, message.content, {
        ...message.properties,
        headers: {
          ...message.properties.headers,
          [NOTIFICATION_PUSH_RETRY_HEADER]: retryCount + 1,
        },
      });
      channel.ack(message);
      return;
    }

    this.logger.error(
      `Exhausted retries for notification ${notificationId} (${errorCode}); routing to DLQ`,
    );
    try {
      await this.notificationService.markFailed(notificationId, errorCode);
    } catch (error) {
      this.logger.error(
        `Failed to mark notification ${notificationId} as FAILED`,
        error instanceof Error ? error.stack : error,
      );
    }
    channel.nack(message, false, false);
  }

  private isUnregisteredTokenError(code: string): boolean {
    return NotificationPushConsumer.UNREGISTERED_TOKEN_CODES.has(code);
  }

  private getRetryCount(message: ConsumeMessage): number {
    const raw: unknown =
      message.properties.headers?.[NOTIFICATION_PUSH_RETRY_HEADER];
    return typeof raw === 'number' ? raw : 0;
  }
}
