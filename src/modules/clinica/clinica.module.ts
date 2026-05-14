import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClinicaController } from './clinica.controller';
import { GeocodingService } from './geocoding.service';
import { PlacesService } from './places.service';

@Module({
  imports: [AuthModule],
  controllers: [ClinicaController],
  providers: [GeocodingService, PlacesService],
  exports: [GeocodingService, PlacesService],
})
export class ClinicaModule {}
