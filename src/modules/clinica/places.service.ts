import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlacesClinicResponseDto } from '@petcardorg/shared';

type NearbySearchParams = {
  lat: number;
  lng: number;
  radiusMeters: number;
  openNow?: boolean;
  maxResults?: number;
};

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

  getPhotoUrl(photoName: string, maxWidth = 400): string {
    return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidth}&key=${this.apiKey}`;
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
