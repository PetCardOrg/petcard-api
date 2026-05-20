import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { DoseReminderService } from './dose-reminder.service';

@Module({
  imports: [NotificationModule],
  providers: [DoseReminderService],
  exports: [DoseReminderService],
})
export class ReminderModule {}
