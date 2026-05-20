import { registerAs } from '@nestjs/config';

export const rabbitmqConfig = registerAs('rabbitmq', () => ({
  url: process.env.RABBITMQ_URL ?? 'amqp://petcard:petcard123@localhost:5672',
  qrCodeQueue: process.env.RABBITMQ_QR_CODE_QUEUE ?? 'qr-code.generate',
  qrCodeDlq: process.env.RABBITMQ_QR_CODE_DLQ ?? 'qr-code.generate.dlq',
  notificationPushQueue:
    process.env.RABBITMQ_NOTIFICATION_PUSH_QUEUE ?? 'notification.push',
  notificationPushDlq:
    process.env.RABBITMQ_NOTIFICATION_PUSH_DLQ ?? 'notification.push.dlq',
}));
