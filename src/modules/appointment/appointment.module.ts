import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PetModule } from '../pet/pet.module';
import { AppointmentController } from './appointment.controller';
import { AppointmentService } from './appointment.service';

@Module({
  imports: [AuthModule, PetModule],
  controllers: [AppointmentController],
  providers: [AppointmentService],
  exports: [AppointmentService],
})
export class AppointmentModule {}
