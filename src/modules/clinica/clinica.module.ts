import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClinicaController } from './clinica.controller';
import { ClinicaService } from './clinica.service';

@Module({
  imports: [AuthModule],
  controllers: [ClinicaController],
  providers: [ClinicaService],
  exports: [ClinicaService],
})
export class ClinicaModule {}
