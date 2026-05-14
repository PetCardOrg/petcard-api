import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { QR_CODE_DLQ_ROUTING_KEY, QR_CODE_DLX } from './queue.constants';

@Injectable()
export class RabbitMqTopologyService implements OnModuleInit {
  private readonly logger = new Logger(RabbitMqTopologyService.name);

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('rabbitmq.url')!;
    const dlq = this.config.get<string>('rabbitmq.qrCodeDlq')!;

    const connection = await amqp.connect(url);
    try {
      const channel = await connection.createChannel();
      await channel.assertExchange(QR_CODE_DLX, 'direct', { durable: true });
      await channel.assertQueue(dlq, { durable: true });
      await channel.bindQueue(dlq, QR_CODE_DLX, QR_CODE_DLQ_ROUTING_KEY);
      await channel.close();
      this.logger.log(`DLX/DLQ ready (exchange=${QR_CODE_DLX}, queue=${dlq})`);
    } finally {
      await connection.close();
    }
  }
}
