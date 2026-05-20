import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import type { NotificationPushMessage } from './dto/notification-push.message';
import {
  NOTIFICATION_PUSH_CLIENT,
  NOTIFICATION_PUSH_PATTERN,
} from './queue.constants';

@Injectable()
export class NotificationPushPublisher {
  private readonly logger = new Logger(NotificationPushPublisher.name);

  constructor(
    @Inject(NOTIFICATION_PUSH_CLIENT) private readonly client: ClientProxy,
  ) {}

  async publish(message: NotificationPushMessage): Promise<void> {
    try {
      await lastValueFrom(this.client.emit(NOTIFICATION_PUSH_PATTERN, message));
    } catch (error) {
      this.logger.error(
        `Failed to publish notification.push for notification ${message.notification_id}`,
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }
}
