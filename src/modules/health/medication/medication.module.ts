import { Module } from '@nestjs/common';
import { HistoricoModule } from '../../historico/historico.module';
import { AuthModule } from '../../auth/auth.module';
import { PetModule } from '../../pet/pet.module';
import { VeterinarioModule } from '../../veterinario/veterinario.module';
import { MedicationController } from './medication.controller';
import { MedicationService } from './medication.service';

@Module({
  imports: [HistoricoModule, AuthModule, PetModule, VeterinarioModule],
  controllers: [MedicationController],
  providers: [MedicationService],
})
export class MedicationModule {}
