import { Injectable, Logger } from '@nestjs/common';
import {
  DeviceToken,
  Notification,
  NotificationKind,
  NotificationStatus,
} from '@prisma/client';
import { RegisterDeviceDto } from '@petcardorg/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationPushPublisher } from '../queue/notification-push.publisher';

export interface SchedulePushInput {
  tutorId: string;
  kind: NotificationKind;
  referenceType: string;
  referenceId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  appointmentId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: NotificationPushPublisher,
  ) {}

  async registerDevice(
    tutorId: string,
    dto: RegisterDeviceDto,
  ): Promise<DeviceToken> {
    const existing = await this.prisma.deviceToken.findUnique({
      where: { token: dto.token },
    });

    if (existing && existing.tutorId !== tutorId) {
      this.logger.warn(
        `Device token reattributed from tutor ${existing.tutorId} to ${tutorId}`,
      );
    }

    return this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      create: { tutorId, token: dto.token, platform: dto.platform },
      update: { tutorId, platform: dto.platform, lastSeenAt: new Date() },
    });
  }

  async deleteByToken(token: string): Promise<void> {
    await this.prisma.deviceToken.deleteMany({ where: { token } });
  }

  async markSent(notificationId: string, fcmMessageId?: string): Promise<void> {
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: NotificationStatus.SENT,
        fcmMessageId: fcmMessageId ?? null,
        sentAt: new Date(),
      },
    });
  }

  async markFailed(notificationId: string, errorCode: string): Promise<void> {
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { status: NotificationStatus.FAILED, errorCode },
    });
  }

  async schedulePush(input: SchedulePushInput): Promise<Notification[]> {
    const tokens = await this.prisma.deviceToken.findMany({
      where: { tutorId: input.tutorId },
    });

    if (tokens.length === 0) {
      this.logger.debug(
        `No device tokens for tutor ${input.tutorId}; skipping ${input.kind}`,
      );
      return [];
    }

    const notifications: Notification[] = [];
    for (const token of tokens) {
      const payload = {
        title: input.title,
        body: input.body,
        data: input.data ?? {},
      };
      const notification = await this.prisma.notification.create({
        data: {
          tutorId: input.tutorId,
          appointmentId: input.appointmentId,
          kind: input.kind,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          payload,
          metadata: input.metadata ? (input.metadata as object) : undefined,
          status: NotificationStatus.PENDING,
        },
      });
      notifications.push(notification);

      try {
        await this.publisher.publish({
          notification_id: notification.id,
          tutor_id: input.tutorId,
          device_token: token.token,
          kind: input.kind,
          title: input.title,
          body: input.body,
          data: input.data,
        });
      } catch (error) {
        this.logger.error(
          `Failed to enqueue push for notification ${notification.id}; will stay PENDING`,
          error instanceof Error ? error.stack : error,
        );
      }
    }

    return notifications;
  }
}
