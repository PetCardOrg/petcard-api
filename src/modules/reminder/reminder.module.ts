import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { AppointmentReminderService } from './appointment-reminder.service';
import { DoseReminderService } from './dose-reminder.service';
import { ReminderTriggerController } from './reminder-trigger.controller';
import { ReminderTriggerService } from './reminder-trigger.service';

@Module({
  imports: [NotificationModule],
  controllers: [ReminderTriggerController],
  providers: [
    DoseReminderService,
    AppointmentReminderService,
    ReminderTriggerService,
  ],
  exports: [
    DoseReminderService,
    AppointmentReminderService,
    ReminderTriggerService,
  ],
})
export class ReminderModule {}
