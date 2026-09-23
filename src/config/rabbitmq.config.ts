import { registerAs } from '@nestjs/config';

export const rabbitmqConfig = registerAs('rabbitmq', () => ({
  url: process.env.RABBITMQ_URL ?? 'amqp://petcard:petcard123@localhost:5672',
  qrCodeQueue: process.env.RABBITMQ_QR_CODE_QUEUE ?? 'qr-code.generate',
  qrCodeDlq: process.env.RABBITMQ_QR_CODE_DLQ ?? 'qr-code.generate.dlq',
  // Nome da exchange fixo no código roteava DLQs de todos os ambientes que
  // compartilham a mesma instância CloudAMQP para a mesma exchange (mesma
  // routing key "dead" em todas) — mensagem morta de um ambiente vazava para
  // a fila do outro. Configurável por env var para caber um nome por
  // ambiente (ver ADR-011).
  qrCodeDlx: process.env.RABBITMQ_QR_CODE_DLX ?? 'qr-code.dlx',
  notificationPushQueue:
    process.env.RABBITMQ_NOTIFICATION_PUSH_QUEUE ?? 'notification.push',
  notificationPushDlq:
    process.env.RABBITMQ_NOTIFICATION_PUSH_DLQ ?? 'notification.push.dlq',
  notificationPushDlx:
    process.env.RABBITMQ_NOTIFICATION_PUSH_DLX ?? 'notification.push.dlx',
  calendarSyncQueue:
    process.env.RABBITMQ_CALENDAR_SYNC_QUEUE ?? 'calendar.sync',
  calendarSyncDlq:
    process.env.RABBITMQ_CALENDAR_SYNC_DLQ ?? 'calendar.sync.dlq',
  calendarSyncDlx:
    process.env.RABBITMQ_CALENDAR_SYNC_DLX ?? 'calendar.sync.dlx',
}));
