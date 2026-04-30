import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CardModule } from '../card/card.module';
import { UploadModule } from '../upload/upload.module';
import { QrCodeConsumer } from './qr-code.consumer';
import { QrCodePublisher } from './qr-code.publisher';
import { QR_CODE_CLIENT } from './queue.constants';

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
            queueOptions: { durable: true },
            persistent: true,
          },
        }),
      },
    ]),
  ],
  controllers: [QrCodeConsumer],
  providers: [QrCodePublisher],
  exports: [QrCodePublisher],
})
export class QueueModule {}
