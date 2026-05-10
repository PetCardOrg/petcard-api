import { Controller, Get, Query } from '@nestjs/common';
import {
  ClinicaResponseDto,
  FindNearbyClinicsQueryDto,
  FindNearbyPlacesQueryDto,
  GeocodeResponseDto,
  PlacesClinicResponseDto,
} from '@petcardorg/shared';
import { Auth } from '../auth/decorators/auth.decorator';
import { Role } from '../auth/enums/role.enum';
import { ClinicaService } from './clinica.service';
import { GeocodingService } from './geocoding.service';
import { PlacesService } from './places.service';

@Controller('clinicas')
export class ClinicaController {
  constructor(
    private readonly clinicaService: ClinicaService,
    private readonly placesService: PlacesService,
    private readonly geocodingService: GeocodingService,
  ) {}

  @Get()
  @Auth(Role.TUTOR, Role.VET)
  async findNearby(
    @Query() query: FindNearbyClinicsQueryDto,
  ): Promise<ClinicaResponseDto[]> {
    return this.clinicaService.findNearby(query);
  }

  @Get('places')
  @Auth(Role.TUTOR, Role.VET)
  async findNearbyPlaces(
    @Query() query: FindNearbyPlacesQueryDto,
  ): Promise<PlacesClinicResponseDto[]> {
    return this.placesService.searchNearbyVetClinics({
      lat: query.lat,
      lng: query.lng,
      radiusMeters: query.radiusKm * 1000,
      openNow: query.openNow,
      maxResults: query.maxResults,
    });
  }

  @Get('geocode')
  @Auth(Role.TUTOR, Role.VET)
  async geocode(
    @Query('address') address: string,
  ): Promise<GeocodeResponseDto> {
    return this.geocodingService.geocode(address);
  }
}
