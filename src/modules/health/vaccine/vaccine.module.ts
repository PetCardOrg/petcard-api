import { Module } from '@nestjs/common';
import { HistoricoModule } from '../../historico/historico.module';
import { AuthModule } from '../../auth/auth.module';
import { PetModule } from '../../pet/pet.module';
import { VaccineController } from './vaccine.controller';
import { VaccineService } from './vaccine.service';

@Module({
  imports: [HistoricoModule, AuthModule, PetModule],
  controllers: [VaccineController],
  providers: [VaccineService],
})
export class VaccineModule {}
