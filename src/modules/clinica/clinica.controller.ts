import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  FindNearbyPlacesQueryDto,
  GeocodeResponseDto,
  PlacesClinicResponseDto,
} from '@petcardorg/shared';
import { Auth } from '../auth/decorators/auth.decorator';
import { Role } from '../auth/enums/role.enum';
import { AutocompleteQueryDto } from './dto/autocomplete-query.dto';
import { GeocodeQueryDto } from './dto/geocode-query.dto';
import { PlaceSuggestionResponseDto } from './dto/place-suggestion-response.dto';
import { GeocodingService } from './geocoding.service';
import { PlacesService } from './places.service';

@ApiTags('clinicas')
@Controller('clinicas')
export class ClinicaController {
  constructor(
    private readonly placesService: PlacesService,
    private readonly geocodingService: GeocodingService,
  ) {}

  @Get('places')
  @Auth(Role.TUTOR, Role.VET)
  @ApiOperation({
    summary: 'Buscar clínicas veterinárias próximas (Google Places)',
  })
  @ApiOkResponse({ type: PlacesClinicResponseDto, isArray: true })
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

  @Get('autocomplete')
  @Auth(Role.TUTOR, Role.VET)
  @ApiOperation({
    summary: 'Sugerir locais conforme o usuário digita (Google Places)',
    description:
      'Alimenta o campo "Local" do agendamento. Devolve tanto estabelecimentos ' +
      '(petshop, clínica) quanto endereços, no máximo 5 por chamada.',
  })
  @ApiOkResponse({ type: PlaceSuggestionResponseDto, isArray: true })
  async autocomplete(
    @Query() query: AutocompleteQueryDto,
  ): Promise<PlaceSuggestionResponseDto[]> {
    return this.placesService.autocomplete({
      input: query.input,
      lat: query.lat,
      lng: query.lng,
      sessionToken: query.sessionToken,
    });
  }

  @Get('geocode')
  @Auth(Role.TUTOR, Role.VET)
  @ApiOperation({ summary: 'Geocodificar endereço em lat/lng' })
  @ApiOkResponse({ type: GeocodeResponseDto })
  @ApiQuery({ name: 'address', description: 'Endereço a geocodificar' })
  @ApiNotFoundResponse({ description: 'Endereço não encontrado' })
  async geocode(@Query() query: GeocodeQueryDto): Promise<GeocodeResponseDto> {
    return this.geocodingService.geocode(query.address);
  }
}
