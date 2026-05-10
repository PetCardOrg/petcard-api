import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClinicaController } from './clinica.controller';
import { ClinicaService } from './clinica.service';
import { GeocodingService } from './geocoding.service';
import { PlacesService } from './places.service';

@Module({
  imports: [AuthModule],
  controllers: [ClinicaController],
  providers: [ClinicaService, GeocodingService, PlacesService],
  exports: [ClinicaService, GeocodingService, PlacesService],
})
export class ClinicaModule {}
