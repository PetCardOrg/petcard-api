import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
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

/** Largura da foto de clínica — a única usada pelo card do mobile hoje. */
const PHOTO_MAX_WIDTH_PX = 400;

/**
 * Validade do token assinado da foto. Curta de propósito: o token só precisa
 * sobreviver do momento em que `GET /clinicas/places` responde até o card da
 * clínica terminar de carregar a imagem, não para guardar o link.
 */
const PHOTO_TOKEN_TTL_MS = 15 * 60 * 1000;

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
  private readonly logger = new Logger(PlacesService.name);
  private readonly apiKey: string;
  private readonly apiBaseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    const key = this.configService.get<string>('googleMaps.apiKey');
    if (!key) {
      throw new Error('GOOGLE_MAPS_API_KEY is not configured');
    }
    this.apiKey = key;

    const apiBaseUrl = this.configService.get<string>('app.apiBaseUrl');
    if (!apiBaseUrl) {
      throw new Error('API_BASE_URL is not configured');
    }
    this.apiBaseUrl = apiBaseUrl;

    this.timeoutMs =
      this.configService.get<number>('googleMaps.timeoutMs') ?? 15000;
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

    let response: Response;
    try {
      response = await fetch(
        'https://places.googleapis.com/v1/places:searchNearby',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.apiKey,
            'X-Goog-FieldMask': fieldMask,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
    } catch (error) {
      this.logger.error(
        'Falha ao buscar clínicas no Google Places',
        error instanceof Error ? error.stack : error,
      );
      throw new HttpException(
        'Não foi possível buscar clínicas agora. Tente novamente.',
        HttpStatus.BAD_GATEWAY,
      );
    }

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

    let response: Response;
    try {
      response = await fetch(
        'https://places.googleapis.com/v1/places:autocomplete',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.apiKey,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
    } catch (error) {
      this.logger.error(
        'Falha ao sugerir locais no Google Places',
        error instanceof Error ? error.stack : error,
      );
      throw new HttpException(
        'Não foi possível sugerir locais agora. Tente novamente.',
        HttpStatus.BAD_GATEWAY,
      );
    }

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

  /**
   * Busca os bytes da foto no Google e devolve prontos para a API repassar.
   *
   * Antes, `photoUrl` ia com `key=${apiKey}` embutida na URL do Google, direto
   * na resposta de `GET /clinicas/places` — qualquer tutor logado extraía a
   * chave do JSON e chamava Places/Geocoding por fora até estourar a cota
   * (faturada por chamada). Agora a chave nunca sai do servidor: o `photoUrl`
   * devolvido aponta para `GET /clinicas/fotos/:token` (`buildPhotoUrl`
   * abaixo), esta função busca a foto de verdade e a API devolve os bytes.
   *
   * O `name` do Google já inclui o `placeId`, então um 302 para a URL dele
   * vazaria a chave no header `Location` — por isso a busca acontece aqui, no
   * servidor, e não um redirect.
   */
  async fetchPhoto(
    token: string,
  ): Promise<{ contentType: string; body: Buffer }> {
    const photoName = this.resolvePhotoToken(token);

    let response: Response;
    try {
      response = await fetch(
        `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${PHOTO_MAX_WIDTH_PX}&key=${this.apiKey}`,
        { signal: AbortSignal.timeout(this.timeoutMs) },
      );
    } catch (error) {
      this.logger.error(
        `Falha ao buscar a foto ${photoName} no Google Places`,
        error instanceof Error ? error.stack : error,
      );
      throw new HttpException(
        'Não foi possível carregar a foto da clínica agora.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    if (!response.ok) {
      throw new HttpException(
        'Não foi possível carregar a foto da clínica agora.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const upstreamContentType = response.headers.get('content-type') ?? '';
    const contentType = upstreamContentType.startsWith('image/')
      ? upstreamContentType
      : 'application/octet-stream';
    const body = Buffer.from(await response.arrayBuffer());
    return { contentType, body };
  }

  /** Monta o `photoUrl` público a partir do `name` da foto no Google. */
  private buildPhotoUrl(photoName: string): string {
    const token = this.signPhotoToken(photoName);
    return `${this.apiBaseUrl}/clinicas/fotos/${token}`;
  }

  /**
   * Assina o `name` da foto (ex.: `places/{placeId}/photos/{photoId}`) com um
   * prazo curto. Mesmo padrão do `state` do OAuth do Calendar
   * (`GoogleCalendarService.signState`): reaproveita o `JWT_SECRET` em vez de
   * introduzir mais um segredo só para isso.
   */
  private signPhotoToken(photoName: string): string {
    const encodedName = Buffer.from(photoName, 'utf8').toString('base64url');
    const expiresAt = Date.now() + PHOTO_TOKEN_TTL_MS;
    const payload = `${encodedName}.${expiresAt}`;
    return `${payload}.${this.photoTokenSignature(payload)}`;
  }

  /**
   * Confere a assinatura e o prazo do token e devolve o `name` da foto de
   * origem. Qualquer inconsistência recusa o pedido antes de gastar uma
   * chamada no Google.
   */
  private resolvePhotoToken(token: string): string {
    const partes = token?.split('.') ?? [];
    if (partes.length !== 3) {
      throw new BadRequestException('Token de foto inválido.');
    }

    const [encodedName, expiresAtRaw, assinatura] = partes;
    const esperada = this.photoTokenSignature(`${encodedName}.${expiresAtRaw}`);

    const recebida = Buffer.from(assinatura);
    const referencia = Buffer.from(esperada);
    if (
      recebida.length !== referencia.length ||
      !timingSafeEqual(recebida, referencia)
    ) {
      throw new BadRequestException('Token de foto inválido.');
    }

    const expiresAt = Number(expiresAtRaw);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
      throw new BadRequestException(
        'O link da foto expirou. Busque a clínica de novo.',
      );
    }

    return Buffer.from(encodedName, 'base64url').toString('utf8');
  }

  private photoTokenSignature(payload: string): string {
    const secret = this.configService.get<string>('auth.jwtSecret');
    if (!secret) {
      throw new Error(
        'JWT_SECRET é obrigatória para assinar a URL de foto da clínica.',
      );
    }
    return createHmac('sha256', secret).update(payload).digest('base64url');
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
        ? this.buildPhotoUrl(place.photos[0].name)
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
