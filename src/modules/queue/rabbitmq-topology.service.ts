import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import {
  CALENDAR_SYNC_DLQ_ROUTING_KEY,
  NOTIFICATION_PUSH_DLQ_ROUTING_KEY,
  QR_CODE_DLQ_ROUTING_KEY,
} from './queue.constants';

@Injectable()
export class RabbitMqTopologyService implements OnModuleInit {
  private readonly logger = new Logger(RabbitMqTopologyService.name);

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('rabbitmq.url')!;
    const qrCodeDlq = this.config.get<string>('rabbitmq.qrCodeDlq')!;
    const qrCodeDlx = this.config.get<string>('rabbitmq.qrCodeDlx')!;
    const notificationPushDlq = this.config.get<string>(
      'rabbitmq.notificationPushDlq',
    )!;
    const notificationPushDlx = this.config.get<string>(
      'rabbitmq.notificationPushDlx',
    )!;
    const calendarSyncDlq = this.config.get<string>(
      'rabbitmq.calendarSyncDlq',
    )!;
    const calendarSyncDlx = this.config.get<string>(
      'rabbitmq.calendarSyncDlx',
    )!;

    const connection = await amqp.connect(url);
    try {
      const channel = await connection.createChannel();

      await channel.assertExchange(qrCodeDlx, 'direct', { durable: true });
      await channel.assertQueue(qrCodeDlq, { durable: true });
      await channel.bindQueue(qrCodeDlq, qrCodeDlx, QR_CODE_DLQ_ROUTING_KEY);
      this.logger.log(
        `DLX/DLQ ready (exchange=${qrCodeDlx}, queue=${qrCodeDlq})`,
      );

      await channel.assertExchange(notificationPushDlx, 'direct', {
        durable: true,
      });
      await channel.assertQueue(notificationPushDlq, { durable: true });
      await channel.bindQueue(
        notificationPushDlq,
        notificationPushDlx,
        NOTIFICATION_PUSH_DLQ_ROUTING_KEY,
      );
      this.logger.log(
        `DLX/DLQ ready (exchange=${notificationPushDlx}, queue=${notificationPushDlq})`,
      );

      await channel.assertExchange(calendarSyncDlx, 'direct', {
        durable: true,
      });
      await channel.assertQueue(calendarSyncDlq, { durable: true });
      await channel.bindQueue(
        calendarSyncDlq,
        calendarSyncDlx,
        CALENDAR_SYNC_DLQ_ROUTING_KEY,
      );
      this.logger.log(
        `DLX/DLQ ready (exchange=${calendarSyncDlx}, queue=${calendarSyncDlq})`,
      );

      await channel.close();
    } finally {
      await connection.close();
    }
  }
}
