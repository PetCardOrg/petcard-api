import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CardModule } from '../card/card.module';
import { ColeiraModule } from '../coleira/coleira.module';
import { UploadModule } from '../upload/upload.module';
import { CalendarSyncPublisher } from './calendar-sync.publisher';
import { NotificationPushPublisher } from './notification-push.publisher';
import { QrCodeConsumer } from './qr-code.consumer';
import { QrCodePublisher } from './qr-code.publisher';
import { RabbitMqTopologyService } from './rabbitmq-topology.service';
import { FILAS, rmqOptions } from './rmq';

@Global()
@Module({
  imports: [
    CardModule,
    ColeiraModule,
    UploadModule,
    ClientsModule.registerAsync(
      FILAS.map((fila) => ({
        name: fila.client,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ as const,
          options: {
            ...rmqOptions(
              config.get<string>('rabbitmq.url')!,
              config.get<string>(fila.queue)!,
              config.get<string>(fila.dlx)!,
              fila.dlqRoutingKey,
            ),
            persistent: true,
          },
        }),
      })),
    ),
  ],
  controllers: [QrCodeConsumer],
  providers: [
    QrCodePublisher,
    NotificationPushPublisher,
    CalendarSyncPublisher,
    RabbitMqTopologyService,
  ],
  exports: [QrCodePublisher, NotificationPushPublisher, CalendarSyncPublisher],
})
export class QueueModule {}
