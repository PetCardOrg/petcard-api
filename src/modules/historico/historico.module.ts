import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PetModule } from '../pet/pet.module';
import { VeterinarioModule } from '../veterinario/veterinario.module';
import { AcaoClinicaService } from './acao-clinica.service';
import { HistoricoClinicoController } from './historico-clinico.controller';
import { HistoricoClinicoService } from './historico-clinico.service';

@Module({
  imports: [forwardRef(() => AuthModule), PetModule, VeterinarioModule],
  controllers: [HistoricoClinicoController],
  providers: [AcaoClinicaService, HistoricoClinicoService],
  // A trilha é escrita pelos módulos que alteram registro clínico.
  exports: [AcaoClinicaService],
})
export class HistoricoModule {}
