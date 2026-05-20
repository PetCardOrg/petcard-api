import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TutorModule } from '../tutor/tutor.module';
import { DevicesController } from './devices.controller';
import { FcmClient } from './fcm.client';
import { NotificationService } from './notification.service';

@Module({
  imports: [AuthModule, TutorModule],
  controllers: [DevicesController],
  providers: [FcmClient, NotificationService],
  exports: [FcmClient, NotificationService],
})
export class NotificationModule {}
