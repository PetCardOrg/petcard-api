import { Module } from '@nestjs/common';
import { HistoricoModule } from '../../historico/historico.module';
import { AuthModule } from '../../auth/auth.module';
import { PetModule } from '../../pet/pet.module';
import { VeterinarioModule } from '../../veterinario/veterinario.module';
import { VaccineController } from './vaccine.controller';
import { VaccineService } from './vaccine.service';

@Module({
  imports: [HistoricoModule, AuthModule, PetModule, VeterinarioModule],
  controllers: [VaccineController],
  providers: [VaccineService],
})
export class VaccineModule {}
