import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { AppointmentReminderService } from './appointment-reminder.service';
import { DoseReminderService } from './dose-reminder.service';

@Module({
  imports: [NotificationModule],
  providers: [DoseReminderService, AppointmentReminderService],
  exports: [DoseReminderService, AppointmentReminderService],
})
export class ReminderModule {}
