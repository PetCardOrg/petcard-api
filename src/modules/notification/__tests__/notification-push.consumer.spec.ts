import { RmqContext } from '@nestjs/microservices';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationKind } from '@prisma/client';
import type { NotificationPushMessage } from '../../queue/dto/notification-push.message';
import {
  NOTIFICATION_PUSH_MAX_RETRIES,
  NOTIFICATION_PUSH_RETRY_HEADER,
} from '../../queue/queue.constants';
import { FcmClient } from '../fcm.client';
import { NotificationPushConsumer } from '../notification-push.consumer';
import { NotificationService } from '../notification.service';

const baseMessage: NotificationPushMessage = {
  notification_id: 'n1',
  tutor_id: 'tutor-1',
  device_token: 'fcm-token-abc',
  kind: NotificationKind.DOSE_REMINDER,
  title: 'Vacina',
  body: 'Hora da próxima dose',
};

const buildContext = (
  channel: { ack: jest.Mock; nack: jest.Mock; publish: jest.Mock },
  headers: Record<string, unknown> = {},
) => {
  const message = {
    content: Buffer.from(JSON.stringify(baseMessage)),
    fields: { routingKey: 'notification.push' },
    properties: { headers },
  };
  const context = {
    getChannelRef: () => channel,
    getMessage: () => message,
  } as unknown as RmqContext;
  return { context, message };
};

describe('NotificationPushConsumer', () => {
  let consumer: NotificationPushConsumer;
  let fcmClient: { send: jest.Mock };
  let notificationService: {
    markSent: jest.Mock;
    markFailed: jest.Mock;
    deleteByToken: jest.Mock;
  };
  let channel: { ack: jest.Mock; nack: jest.Mock; publish: jest.Mock };

  beforeEach(async () => {
    fcmClient = { send: jest.fn() };
    notificationService = {
      markSent: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      deleteByToken: jest.fn().mockResolvedValue(undefined),
    };
    channel = { ack: jest.fn(), nack: jest.fn(), publish: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationPushConsumer,
        { provide: FcmClient, useValue: fcmClient },
        { provide: NotificationService, useValue: notificationService },
      ],
    }).compile();

    consumer = module.get(NotificationPushConsumer);
  });

  it('marks the notification SENT and acks on successful send', async () => {
    fcmClient.send.mockResolvedValue({ messageId: 'msg-123' });
    const { context, message } = buildContext(channel);

    await consumer.handlePush(baseMessage, context);

    expect(fcmClient.send).toHaveBeenCalledWith('fcm-token-abc', {
      title: 'Vacina',
      body: 'Hora da próxima dose',
      data: undefined,
    });
    expect(notificationService.markSent).toHaveBeenCalledWith('n1', 'msg-123');
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
    expect(channel.publish).not.toHaveBeenCalled();
  });

  it('marks SENT (no messageId) and acks when FCM is disabled', async () => {
    fcmClient.send.mockResolvedValue({});
    const { context, message } = buildContext(channel);

    await consumer.handlePush(baseMessage, context);

    expect(notificationService.markSent).toHaveBeenCalledWith('n1', undefined);
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('acks and skips when notification_id is missing', async () => {
    const { context, message } = buildContext(channel);

    await consumer.handlePush(
      {} as unknown as NotificationPushMessage,
      context,
    );

    expect(fcmClient.send).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('soft-invalidates a dead token and marks FAILED without retrying', async () => {
    fcmClient.send.mockResolvedValue({
      errorCode: 'messaging/registration-token-not-registered',
    });
    const { context, message } = buildContext(channel);

    await consumer.handlePush(baseMessage, context);

    expect(notificationService.deleteByToken).toHaveBeenCalledWith(
      'fcm-token-abc',
    );
    expect(notificationService.markFailed).toHaveBeenCalledWith(
      'n1',
      'messaging/registration-token-not-registered',
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.publish).not.toHaveBeenCalled();
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('retries with incremented counter on a transient FCM error', async () => {
    fcmClient.send.mockResolvedValue({
      errorCode: 'messaging/server-unavailable',
    });
    const { context, message } = buildContext(channel);

    await consumer.handlePush(baseMessage, context);

    expect(channel.publish).toHaveBeenCalledWith(
      '',
      'notification.push',
      message.content,
      expect.objectContaining({
        headers: expect.objectContaining({
          [NOTIFICATION_PUSH_RETRY_HEADER]: 1,
        }) as unknown,
      }),
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(notificationService.markFailed).not.toHaveBeenCalled();
  });

  it('marks FAILED and nacks to DLQ when retries are exhausted', async () => {
    fcmClient.send.mockResolvedValue({
      errorCode: 'messaging/server-unavailable',
    });
    const { context, message } = buildContext(channel, {
      [NOTIFICATION_PUSH_RETRY_HEADER]: NOTIFICATION_PUSH_MAX_RETRIES,
    });

    await consumer.handlePush(baseMessage, context);

    expect(notificationService.markFailed).toHaveBeenCalledWith(
      'n1',
      'messaging/server-unavailable',
    );
    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(channel.publish).not.toHaveBeenCalled();
    expect(channel.ack).not.toHaveBeenCalled();
  });

  it('retries when an unexpected error is thrown (e.g. DB update fails)', async () => {
    fcmClient.send.mockResolvedValue({ messageId: 'msg-123' });
    notificationService.markSent.mockRejectedValue(new Error('DB down'));
    const { context, message } = buildContext(channel);

    await consumer.handlePush(baseMessage, context);

    expect(channel.publish).toHaveBeenCalledWith(
      '',
      'notification.push',
      message.content,
      expect.objectContaining({
        headers: expect.objectContaining({
          [NOTIFICATION_PUSH_RETRY_HEADER]: 1,
        }) as unknown,
      }),
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
  });
});
