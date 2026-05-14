import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CardModule } from '../card/card.module';
import { UploadModule } from '../upload/upload.module';
import { QrCodeConsumer } from './qr-code.consumer';
import { QrCodePublisher } from './qr-code.publisher';
import {
  QR_CODE_CLIENT,
  QR_CODE_DLQ_ROUTING_KEY,
  QR_CODE_DLX,
} from './queue.constants';
import { RabbitMqTopologyService } from './rabbitmq-topology.service';

@Global()
@Module({
  imports: [
    CardModule,
    UploadModule,
    ClientsModule.registerAsync([
      {
        name: QR_CODE_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.get<string>('rabbitmq.url')!],
            queue: config.get<string>('rabbitmq.qrCodeQueue')!,
            queueOptions: {
              durable: true,
              arguments: {
                'x-dead-letter-exchange': QR_CODE_DLX,
                'x-dead-letter-routing-key': QR_CODE_DLQ_ROUTING_KEY,
              },
            },
            persistent: true,
          },
        }),
      },
    ]),
  ],
  controllers: [QrCodeConsumer],
  providers: [QrCodePublisher, RabbitMqTopologyService],
  exports: [QrCodePublisher],
})
export class QueueModule {}
