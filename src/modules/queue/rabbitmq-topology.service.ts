import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { FILAS } from './rmq';

@Injectable()
export class RabbitMqTopologyService implements OnModuleInit {
  private readonly logger = new Logger(RabbitMqTopologyService.name);

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('rabbitmq.url')!;

    const connection = await amqp.connect(url);
    try {
      const channel = await connection.createChannel();

      for (const fila of FILAS) {
        const dlx = this.config.get<string>(fila.dlx)!;
        const dlq = this.config.get<string>(fila.dlq)!;
        await channel.assertExchange(dlx, 'direct', { durable: true });
        await channel.assertQueue(dlq, { durable: true });
        await channel.bindQueue(dlq, dlx, fila.dlqRoutingKey);
        this.logger.log(`DLX/DLQ ready (exchange=${dlx}, queue=${dlq})`);
      }

      await channel.close();
    } finally {
      await connection.close();
    }
  }
}
