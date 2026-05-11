import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type GeocodingResult = {
  lat: number;
  lng: number;
  formattedAddress: string;
};

type GeocodingResponse = {
  status: string;
  results: {
    geometry: { location: { lat: number; lng: number } };
    formatted_address: string;
  }[];
};

@Injectable()
export class GeocodingService {
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    const key = this.configService.get<string>('googleMaps.apiKey');
    if (!key) {
      throw new Error('GOOGLE_MAPS_API_KEY is not configured');
    }
    this.apiKey = key;
  }

  async geocode(address: string): Promise<GeocodingResult> {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', address);
    url.searchParams.set('key', this.apiKey);

    const response = await fetch(url.toString());
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const raw = await response.json();
    const data = raw as GeocodingResponse;

    if (data.status === 'ZERO_RESULTS') {
      throw new HttpException('Endereço não encontrado', HttpStatus.NOT_FOUND);
    }

    if (data.status !== 'OK') {
      throw new HttpException(
        `Erro no geocoding: ${data.status}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const result = data.results[0];
    return {
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      formattedAddress: result.formatted_address,
    };
  }
}
