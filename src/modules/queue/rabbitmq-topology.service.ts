import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import {
  NOTIFICATION_PUSH_DLQ_ROUTING_KEY,
  NOTIFICATION_PUSH_DLX,
  QR_CODE_DLQ_ROUTING_KEY,
  QR_CODE_DLX,
} from './queue.constants';

@Injectable()
export class RabbitMqTopologyService implements OnModuleInit {
  private readonly logger = new Logger(RabbitMqTopologyService.name);

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('rabbitmq.url')!;
    const qrCodeDlq = this.config.get<string>('rabbitmq.qrCodeDlq')!;
    const notificationPushDlq = this.config.get<string>(
      'rabbitmq.notificationPushDlq',
    )!;

    const connection = await amqp.connect(url);
    try {
      const channel = await connection.createChannel();

      await channel.assertExchange(QR_CODE_DLX, 'direct', { durable: true });
      await channel.assertQueue(qrCodeDlq, { durable: true });
      await channel.bindQueue(qrCodeDlq, QR_CODE_DLX, QR_CODE_DLQ_ROUTING_KEY);
      this.logger.log(
        `DLX/DLQ ready (exchange=${QR_CODE_DLX}, queue=${qrCodeDlq})`,
      );

      await channel.assertExchange(NOTIFICATION_PUSH_DLX, 'direct', {
        durable: true,
      });
      await channel.assertQueue(notificationPushDlq, { durable: true });
      await channel.bindQueue(
        notificationPushDlq,
        NOTIFICATION_PUSH_DLX,
        NOTIFICATION_PUSH_DLQ_ROUTING_KEY,
      );
      this.logger.log(
        `DLX/DLQ ready (exchange=${NOTIFICATION_PUSH_DLX}, queue=${notificationPushDlq})`,
      );

      await channel.close();
    } finally {
      await connection.close();
    }
  }
}
