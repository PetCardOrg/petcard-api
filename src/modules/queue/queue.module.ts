import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CardModule } from '../card/card.module';
import { UploadModule } from '../upload/upload.module';
import { CalendarSyncPublisher } from './calendar-sync.publisher';
import { NotificationPushPublisher } from './notification-push.publisher';
import { QrCodeConsumer } from './qr-code.consumer';
import { QrCodePublisher } from './qr-code.publisher';
import {
  CALENDAR_SYNC_CLIENT,
  CALENDAR_SYNC_DLQ_ROUTING_KEY,
  CALENDAR_SYNC_DLX,
  NOTIFICATION_PUSH_CLIENT,
  NOTIFICATION_PUSH_DLQ_ROUTING_KEY,
  NOTIFICATION_PUSH_DLX,
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
      {
        name: NOTIFICATION_PUSH_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.get<string>('rabbitmq.url')!],
            queue: config.get<string>('rabbitmq.notificationPushQueue')!,
            queueOptions: {
              durable: true,
              arguments: {
                'x-dead-letter-exchange': NOTIFICATION_PUSH_DLX,
                'x-dead-letter-routing-key': NOTIFICATION_PUSH_DLQ_ROUTING_KEY,
              },
            },
            persistent: true,
          },
        }),
      },
      {
        name: CALENDAR_SYNC_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.get<string>('rabbitmq.url')!],
            queue: config.get<string>('rabbitmq.calendarSyncQueue')!,
            queueOptions: {
              durable: true,
              arguments: {
                'x-dead-letter-exchange': CALENDAR_SYNC_DLX,
                'x-dead-letter-routing-key': CALENDAR_SYNC_DLQ_ROUTING_KEY,
              },
            },
            persistent: true,
          },
        }),
      },
    ]),
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
