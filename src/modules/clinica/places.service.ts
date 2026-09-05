import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlacesClinicResponseDto } from '@petcardorg/shared';
import { PlaceSuggestionResponseDto } from './dto/place-suggestion-response.dto';

type NearbySearchParams = {
  lat: number;
  lng: number;
  radiusMeters: number;
  openNow?: boolean;
  maxResults?: number;
};

type AutocompleteParams = {
  input: string;
  lat?: number;
  lng?: number;
  sessionToken?: string;
};

/** Raio do viés de localização do autocomplete. */
const AUTOCOMPLETE_BIAS_RADIUS_METERS = 50_000;

/** Teto de sugestões devolvidas — a lista rola dentro de um modal. */
const AUTOCOMPLETE_MAX_SUGGESTIONS = 5;

type PlacePhoto = {
  name: string;
  widthPx: number;
  heightPx: number;
};

type PlaceResult = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  currentOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
  };
  regularOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
  };
  location?: { latitude: number; longitude: number };
  photos?: PlacePhoto[];
  types?: string[];
  businessStatus?: string;
  websiteUri?: string;
  googleMapsUri?: string;
};

type NearbySearchResponse = {
  places?: PlaceResult[];
};

type PlacePrediction = {
  placeId?: string;
  text?: { text?: string };
  structuredFormat?: {
    mainText?: { text?: string };
    secondaryText?: { text?: string };
  };
};

/**
 * O autocomplete devolve dois tipos de sugestão. `queryPrediction` é uma busca
 * textual ("petshop perto de mim"), não um lugar — chega sem `placeId` e não
 * serve para preencher o campo de local.
 */
type AutocompleteResponse = {
  suggestions?: {
    placePrediction?: PlacePrediction;
    queryPrediction?: unknown;
  }[];
};

@Injectable()
export class PlacesService {
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    const key = this.configService.get<string>('googleMaps.apiKey');
    if (!key) {
      throw new Error('GOOGLE_MAPS_API_KEY is not configured');
    }
    this.apiKey = key;
  }

  async searchNearbyVetClinics(
    params: NearbySearchParams,
  ): Promise<PlacesClinicResponseDto[]> {
    const fieldMask = [
      'places.id',
      'places.displayName',
      'places.formattedAddress',
      'places.nationalPhoneNumber',
      'places.internationalPhoneNumber',
      'places.rating',
      'places.userRatingCount',
      'places.currentOpeningHours',
      'places.regularOpeningHours',
      'places.location',
      'places.photos',
      'places.types',
      'places.businessStatus',
      'places.websiteUri',
      'places.googleMapsUri',
    ].join(',');

    const body: Record<string, unknown> = {
      includedTypes: ['veterinary_care'],
      maxResultCount: params.maxResults ?? 20,
      locationRestriction: {
        circle: {
          center: { latitude: params.lat, longitude: params.lng },
          radius: params.radiusMeters,
        },
      },
    };

    const response = await fetch(
      'https://places.googleapis.com/v1/places:searchNearby',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': fieldMask,
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new HttpException(
        `Erro ao buscar clínicas no Google Places: ${errorBody}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const raw = await response.json();
    const data = raw as NearbySearchResponse;
    if (!data.places || data.places.length === 0) {
      return [];
    }

    // O locationRestriction do Places é aplicado de forma aproximada e devolve
    // resultados fora do círculo. Reforçamos o raio com a distância real.
    // O searchNearby também não aceita filtro de "aberto agora" na requisição,
    // então ele é aplicado sobre o horário que vem na resposta.
    return data.places
      .filter((place) => place.location)
      .map((place) => this.mapPlaceToDto(place, params.lat, params.lng))
      .filter((clinic) => clinic.distanceMeters <= params.radiusMeters)
      .filter((clinic) => !params.openNow || clinic.openNow === true);
  }

  /**
   * Sugere locais conforme o tutor digita, no campo "Local" do agendamento.
   *
   * Sem `includedPrimaryTypes`: o tutor tanto escolhe um petshop pelo nome
   * quanto digita um endereço avulso (consulta em domicílio), e restringir por
   * tipo eliminaria o segundo caso.
   *
   * Não há chamada de Place Details depois da escolha — o agendamento guarda
   * só texto, e o próprio `text.text` da sugestão já traz nome + endereço.
   * Details custaria uma requisição a mais por agendamento sem nada em troca.
   */
  async autocomplete(
    params: AutocompleteParams,
  ): Promise<PlaceSuggestionResponseDto[]> {
    const body: Record<string, unknown> = {
      input: params.input,
      languageCode: 'pt-BR',
      regionCode: 'BR',
    };

    if (params.sessionToken) {
      body.sessionToken = params.sessionToken;
    }

    if (params.lat !== undefined && params.lng !== undefined) {
      body.locationBias = {
        circle: {
          center: { latitude: params.lat, longitude: params.lng },
          radius: AUTOCOMPLETE_BIAS_RADIUS_METERS,
        },
      };
    }

    const response = await fetch(
      'https://places.googleapis.com/v1/places:autocomplete',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new HttpException(
        `Erro ao sugerir locais no Google Places: ${errorBody}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const raw = await response.json();
    const data = raw as AutocompleteResponse;

    return (data.suggestions ?? [])
      .map((suggestion) => suggestion.placePrediction)
      .filter(
        (prediction): prediction is PlacePrediction =>
          prediction?.placeId !== undefined,
      )
      .map((prediction) => this.mapPredictionToDto(prediction))
      .slice(0, AUTOCOMPLETE_MAX_SUGGESTIONS);
  }

  getPhotoUrl(photoName: string, maxWidth = 400): string {
    return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidth}&key=${this.apiKey}`;
  }

  /**
   * `structuredFormat` é opcional na resposta do Google. Quando falta, o
   * `text.text` é a única string disponível e vira o rótulo principal, para a
   * sugestão não aparecer em branco na lista.
   */
  private mapPredictionToDto(
    prediction: PlacePrediction,
  ): PlaceSuggestionResponseDto {
    const mainText = prediction.structuredFormat?.mainText?.text;
    const secondaryText = prediction.structuredFormat?.secondaryText?.text;
    const fullText =
      prediction.text?.text ??
      [mainText, secondaryText].filter(Boolean).join(', ');

    return {
      placeId: prediction.placeId!,
      mainText: mainText ?? fullText,
      secondaryText: mainText ? secondaryText : undefined,
      fullText,
    };
  }

  private mapPlaceToDto(
    place: PlaceResult,
    userLat: number,
    userLng: number,
  ): PlacesClinicResponseDto {
    const openingHours = place.currentOpeningHours ?? place.regularOpeningHours;

    return {
      placeId: place.id,
      name: place.displayName?.text ?? 'Sem nome',
      address: place.formattedAddress ?? '',
      phone: place.nationalPhoneNumber ?? place.internationalPhoneNumber,
      rating: place.rating,
      userRatingCount: place.userRatingCount,
      openNow: openingHours?.openNow,
      weekdayHours: openingHours?.weekdayDescriptions,
      coordinates: {
        lat: place.location!.latitude,
        lng: place.location!.longitude,
      },
      distanceMeters: this.calculateDistance(
        userLat,
        userLng,
        place.location!.latitude,
        place.location!.longitude,
      ),
      photoUrl: place.photos?.[0]
        ? this.getPhotoUrl(place.photos[0].name)
        : undefined,
      websiteUrl: place.websiteUri,
      googleMapsUrl: place.googleMapsUri,
      types: place.types,
      businessStatus: place.businessStatus,
    };
  }

  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }
}
