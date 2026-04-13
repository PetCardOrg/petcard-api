import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PetModule } from '../../pet/pet.module';
import { MedicationController } from './medication.controller';
import { MedicationService } from './medication.service';

@Module({
  imports: [AuthModule, PetModule],
  controllers: [MedicationController],
  providers: [MedicationService],
})
export class MedicationModule {}
