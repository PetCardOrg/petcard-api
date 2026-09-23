import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  FindNearbyPlacesQueryDto,
  GeocodeResponseDto,
  PlacesClinicResponseDto,
} from '@petcardorg/shared';
import { Auth } from '../auth/decorators/auth.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Role } from '../auth/enums/role.enum';
import { AutocompleteQueryDto } from './dto/autocomplete-query.dto';
import { GeocodeQueryDto } from './dto/geocode-query.dto';
import { PlaceSuggestionResponseDto } from './dto/place-suggestion-response.dto';
import { GeocodingService } from './geocoding.service';
import { PlacesService } from './places.service';

/**
 * `places`/`autocomplete`/`geocode` chamam o Google, cobrado por chamada —
 * dividem o throttler `places`. `fotos/:token` é o proxy da chave do Google
 * (ver `PlacesService.fetchPhoto`) e tem o seu próprio, `clinica-photo`,
 * porque uma única busca pode disparar até 20 fotos de uma vez. Como em
 * `auth.controller.ts`, o `ThrottlerGuard` avalia TODOS os throttlers
 * nomeados da configuração — cada rota dispensa explicitamente os que não são
 * dela, senão o limite errado (bem mais apertado) valeria aqui.
 */
@ApiTags('clinicas')
@Controller('clinicas')
export class ClinicaController {
  constructor(
    private readonly placesService: PlacesService,
    private readonly geocodingService: GeocodingService,
  ) {}

  @Get('places')
  @Auth(Role.TUTOR, Role.VET)
  @UseGuards(ThrottlerGuard)
  @Throttle({ places: {} })
  @SkipThrottle({ auth: true, 'public-card': true, 'clinica-photo': true })
  @ApiOperation({
    summary: 'Buscar clínicas veterinárias próximas (Google Places)',
  })
  @ApiOkResponse({ type: PlacesClinicResponseDto, isArray: true })
  @ApiTooManyRequestsResponse({ description: 'Limite de requisições excedido' })
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
  @UseGuards(ThrottlerGuard)
  @Throttle({ places: {} })
  @SkipThrottle({ auth: true, 'public-card': true, 'clinica-photo': true })
  @ApiOperation({
    summary: 'Sugerir locais conforme o usuário digita (Google Places)',
    description:
      'Alimenta o campo "Local" do agendamento. Devolve tanto estabelecimentos ' +
      '(petshop, clínica) quanto endereços, no máximo 5 por chamada.',
  })
  @ApiOkResponse({ type: PlaceSuggestionResponseDto, isArray: true })
  @ApiTooManyRequestsResponse({ description: 'Limite de requisições excedido' })
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
  @UseGuards(ThrottlerGuard)
  @Throttle({ places: {} })
  @SkipThrottle({ auth: true, 'public-card': true, 'clinica-photo': true })
  @ApiOperation({ summary: 'Geocodificar endereço em lat/lng' })
  @ApiOkResponse({ type: GeocodeResponseDto })
  @ApiQuery({ name: 'address', description: 'Endereço a geocodificar' })
  @ApiNotFoundResponse({ description: 'Endereço não encontrado' })
  @ApiTooManyRequestsResponse({ description: 'Limite de requisições excedido' })
  async geocode(@Query() query: GeocodeQueryDto): Promise<GeocodeResponseDto> {
    return this.geocodingService.geocode(query.address);
  }

  @Get('fotos/:token')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ 'clinica-photo': {} })
  @SkipThrottle({ auth: true, 'public-card': true, places: true })
  @ApiOperation({
    summary: 'Servir a foto de uma clínica (proxy do Google Places)',
    description:
      'O token vem pronto no `photoUrl` de GET /clinicas/places, assinado e ' +
      'com validade curta. Existe para a GOOGLE_MAPS_API_KEY nunca aparecer ' +
      'numa resposta da API — buscar a foto exigiria a chave.',
  })
  @ApiProduces('image/jpeg', 'image/png', 'image/webp')
  @ApiBadRequestResponse({ description: 'Token de foto inválido ou expirado' })
  @ApiTooManyRequestsResponse({ description: 'Limite de requisições excedido' })
  async foto(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const { contentType, body } = await this.placesService.fetchPhoto(token);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.send(body);
  }
}
