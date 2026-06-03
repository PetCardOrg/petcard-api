import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { appConfig } from './config/app.config';
import { authConfig } from './config/auth.config';
import { awsConfig } from './config/aws.config';
import { cardConfig } from './config/card.config';
import { firebaseConfig } from './config/firebase.config';
import { googleMapsConfig } from './config/google-maps.config';
import { rabbitmqConfig } from './config/rabbitmq.config';
import { reminderConfig } from './config/reminder.config';
import { googleCalendarConfig } from './config/google-calendar.config';
import { encryptionConfig } from './config/encryption.config';
import { CryptoModule } from './common/crypto/crypto.module';
import { AppointmentModule } from './modules/appointment/appointment.module';
import { AuthModule } from './modules/auth/auth.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { CardModule } from './modules/card/card.module';
import { ClinicaModule } from './modules/clinica/clinica.module';
import { DewormingModule } from './modules/health/deworming/deworming.module';
import { MedicationModule } from './modules/health/medication/medication.module';
import { VaccineModule } from './modules/health/vaccine/vaccine.module';
import { NotificationModule } from './modules/notification/notification.module';
import { PetModule } from './modules/pet/pet.module';
import { QueueModule } from './modules/queue/queue.module';
import { ReminderModule } from './modules/reminder/reminder.module';
import { TutorModule } from './modules/tutor/tutor.module';
import { UploadModule } from './modules/upload/upload.module';
import { VetNoteModule } from './modules/vet-note/vet-note.module';
import { VeterinarioModule } from './modules/veterinario/veterinario.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        authConfig,
        awsConfig,
        cardConfig,
        firebaseConfig,
        googleMapsConfig,
        rabbitmqConfig,
        reminderConfig,
        googleCalendarConfig,
        encryptionConfig,
      ],
    }),
    ScheduleModule.forRoot(),
    CryptoModule,
    PrismaModule,
    AuthModule,
    AppointmentModule,
    CalendarModule,
    CardModule,
    TutorModule,
    PetModule,
    VaccineModule,
    DewormingModule,
    MedicationModule,
    UploadModule,
    QueueModule,
    ClinicaModule,
    NotificationModule,
    ReminderModule,
    VetNoteModule,
    VeterinarioModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
