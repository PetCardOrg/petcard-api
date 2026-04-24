import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { authConfig } from './config/auth.config';
import { awsConfig } from './config/aws.config';
import { AuthModule } from './modules/auth/auth.module';
import { CardModule } from './modules/card/card.module';
import { DewormingModule } from './modules/health/deworming/deworming.module';
import { MedicationModule } from './modules/health/medication/medication.module';
import { VaccineModule } from './modules/health/vaccine/vaccine.module';
import { PetModule } from './modules/pet/pet.module';
import { TutorModule } from './modules/tutor/tutor.module';
import { UploadModule } from './modules/upload/upload.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [authConfig, awsConfig],
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
