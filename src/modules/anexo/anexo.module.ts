import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HistoricoModule } from '../historico/historico.module';
import { PetModule } from '../pet/pet.module';
import { UploadModule } from '../upload/upload.module';
import { VeterinarioModule } from '../veterinario/veterinario.module';
import { AnexoController } from './anexo.controller';
import { AnexoService } from './anexo.service';

@Module({
  imports: [
    AuthModule,
    HistoricoModule,
    PetModule,
    UploadModule,
    VeterinarioModule,
  ],
  controllers: [AnexoController],
  providers: [AnexoService],
})
export class AnexoModule {}
