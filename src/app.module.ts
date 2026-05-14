import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { appConfig } from './config/app.config';
import { authConfig } from './config/auth.config';
import { awsConfig } from './config/aws.config';
import { cardConfig } from './config/card.config';
import { googleMapsConfig } from './config/google-maps.config';
import { rabbitmqConfig } from './config/rabbitmq.config';
import { AuthModule } from './modules/auth/auth.module';
import { CardModule } from './modules/card/card.module';
import { ClinicaModule } from './modules/clinica/clinica.module';
import { DewormingModule } from './modules/health/deworming/deworming.module';
import { MedicationModule } from './modules/health/medication/medication.module';
import { VaccineModule } from './modules/health/vaccine/vaccine.module';
import { PetModule } from './modules/pet/pet.module';
import { QueueModule } from './modules/queue/queue.module';
import { TutorModule } from './modules/tutor/tutor.module';
import { UploadModule } from './modules/upload/upload.module';
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
        googleMapsConfig,
        rabbitmqConfig,
      ],
    }),
    PrismaModule,
    AuthModule,
    CardModule,
    TutorModule,
    PetModule,
    VaccineModule,
    DewormingModule,
    MedicationModule,
    UploadModule,
    QueueModule,
    ClinicaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
