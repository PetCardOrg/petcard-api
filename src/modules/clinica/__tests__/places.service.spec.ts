/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlacesService } from '../places.service';

const makeConfig = (key: string | undefined): ConfigService =>
  ({ get: jest.fn().mockReturnValue(key) }) as unknown as ConfigService;

const fullPlace = {
  id: 'place-1',
  displayName: { text: 'Clínica VetCare' },
  formattedAddress: 'Rua A, 100 - Fortaleza',
  nationalPhoneNumber: '(85) 3333-3333',
  internationalPhoneNumber: '+55 85 3333-3333',
  rating: 4.7,
  userRatingCount: 210,
  currentOpeningHours: {
    openNow: true,
    weekdayDescriptions: ['Segunda: 08:00–18:00'],
  },
  location: { latitude: -3.74, longitude: -38.53 },
  photos: [{ name: 'places/place-1/photos/abc', widthPx: 800, heightPx: 600 }],
  types: ['veterinary_care'],
  businessStatus: 'OPERATIONAL',
  websiteUri: 'https://vetcare.example',
  googleMapsUri: 'https://maps.google/?cid=1',
};

const okResponse = (body: unknown) =>
  ({ ok: true, json: async () => body }) as unknown as Response;

describe('PlacesService', () => {
  const originalFetch = global.fetch;
  const userLat = -3.731;
  const userLng = -38.526;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('lança erro no boot quando GOOGLE_MAPS_API_KEY está ausente', () => {
    expect(() => new PlacesService(makeConfig(undefined))).toThrow(
      'GOOGLE_MAPS_API_KEY',
    );
  });

  it('mapeia um place para o DTO com distância calculada e foto', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(okResponse({ places: [fullPlace] }));
    global.fetch = fetchMock;

    const service = new PlacesService(makeConfig('key-xyz'));
    const result = await service.searchNearbyVetClinics({
      lat: userLat,
      lng: userLng,
      radiusMeters: 5000,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      placeId: 'place-1',
      name: 'Clínica VetCare',
      address: 'Rua A, 100 - Fortaleza',
      phone: '(85) 3333-3333',
      rating: 4.7,
      openNow: true,
      coordinates: { lat: -3.74, lng: -38.53 },
      photoUrl: expect.stringContaining(
        'places/place-1/photos/abc/media?maxWidthPx=400&key=key-xyz',
      ),
      websiteUrl: 'https://vetcare.example',
    });
    expect(typeof result[0].distanceMeters).toBe('number');
    expect(result[0].distanceMeters).toBeGreaterThan(0);
  });

  it('usa fallbacks quando campos opcionais estão ausentes', async () => {
    const minimal = {
      id: 'place-2',
      location: { latitude: -3.75, longitude: -38.54 },
    };
    global.fetch = jest
      .fn()
      .mockResolvedValue(okResponse({ places: [minimal] }));

    const service = new PlacesService(makeConfig('key'));
    const [dto] = await service.searchNearbyVetClinics({
      lat: userLat,
      lng: userLng,
      radiusMeters: 5000,
    });

    expect(dto.name).toBe('Sem nome');
    expect(dto.address).toBe('');
    expect(dto.phone).toBeUndefined();
    expect(dto.openNow).toBeUndefined();
    expect(dto.photoUrl).toBeUndefined();
  });

  it('descarta places sem location', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      okResponse({
        places: [fullPlace, { id: 'no-loc', displayName: { text: 'X' } }],
      }),
    );

    const service = new PlacesService(makeConfig('key'));
    const result = await service.searchNearbyVetClinics({
      lat: userLat,
      lng: userLng,
      radiusMeters: 5000,
    });

    expect(result).toHaveLength(1);
    expect(result[0].placeId).toBe('place-1');
  });

  it('descarta places fora do raio solicitado', async () => {
    // fullPlace fica a ~1,1 km do usuário; este, a ~12,5 km.
    const distante = {
      id: 'place-distante',
      displayName: { text: 'Clínica Longe' },
      location: { latitude: -3.83, longitude: -38.58 },
    };
    global.fetch = jest
      .fn()
      .mockResolvedValue(okResponse({ places: [fullPlace, distante] }));

    const service = new PlacesService(makeConfig('key'));
    const result = await service.searchNearbyVetClinics({
      lat: userLat,
      lng: userLng,
      radiusMeters: 2000,
    });

    expect(result).toHaveLength(1);
    expect(result[0].placeId).toBe('place-1');
    expect(result[0].distanceMeters).toBeLessThanOrEqual(2000);
  });

  it('mantém o place exatamente no limite do raio', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(okResponse({ places: [fullPlace] }));

    const service = new PlacesService(makeConfig('key'));
    const [dto] = await service.searchNearbyVetClinics({
      lat: userLat,
      lng: userLng,
      radiusMeters: 100000,
    });

    const noLimite = await service.searchNearbyVetClinics({
      lat: userLat,
      lng: userLng,
      radiusMeters: dto.distanceMeters,
    });

    expect(noLimite).toHaveLength(1);
  });

  it('retorna lista vazia quando o Google não devolve places', async () => {
    global.fetch = jest.fn().mockResolvedValue(okResponse({}));

    const service = new PlacesService(makeConfig('key'));
    const result = await service.searchNearbyVetClinics({
      lat: userLat,
      lng: userLng,
      radiusMeters: 5000,
    });

    expect(result).toEqual([]);
  });

  it('não envia openNow ao Google — o searchNearby não aceita esse campo', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse({ places: [] }));
    global.fetch = fetchMock;

    const service = new PlacesService(makeConfig('key'));
    await service.searchNearbyVetClinics({
      lat: userLat,
      lng: userLng,
      radiusMeters: 5000,
      openNow: true,
    });

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(requestInit.body as string) as Record<
      string,
      unknown
    >;
    expect(body).not.toHaveProperty('openNow');
    expect(body.includedTypes).toContain('veterinary_care');
  });

  it('filtra por aberto agora usando o horário devolvido pelo Google', async () => {
    const fechada = {
      id: 'place-fechada',
      displayName: { text: 'Clínica Fechada' },
      location: { latitude: -3.735, longitude: -38.528 },
      currentOpeningHours: { openNow: false },
    };
    const semHorario = {
      id: 'place-sem-horario',
      displayName: { text: 'Clínica Sem Horário' },
      location: { latitude: -3.733, longitude: -38.527 },
    };
    global.fetch = jest.fn().mockResolvedValue(
      okResponse({
        places: [fullPlace, fechada, semHorario],
      }),
    );

    const service = new PlacesService(makeConfig('key'));
    const result = await service.searchNearbyVetClinics({
      lat: userLat,
      lng: userLng,
      radiusMeters: 5000,
      openNow: true,
    });

    expect(result.map((c) => c.placeId)).toEqual(['place-1']);
  });

  it('mantém clínicas fechadas quando openNow não é solicitado', async () => {
    const fechada = {
      id: 'place-fechada',
      location: { latitude: -3.735, longitude: -38.528 },
      currentOpeningHours: { openNow: false },
    };
    global.fetch = jest
      .fn()
      .mockResolvedValue(okResponse({ places: [fullPlace, fechada] }));

    const service = new PlacesService(makeConfig('key'));
    const result = await service.searchNearbyVetClinics({
      lat: userLat,
      lng: userLng,
      radiusMeters: 5000,
    });

    expect(result).toHaveLength(2);
  });

  it('lança 502 (BAD_GATEWAY) quando a resposta do Google não é ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      text: async () => 'quota exceeded',
    });

    const service = new PlacesService(makeConfig('key'));
    expect.assertions(2);
    try {
      await service.searchNearbyVetClinics({
        lat: userLat,
        lng: userLng,
        radiusMeters: 5000,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(502);
    }
  });

  describe('autocomplete', () => {
    const suggestion = (placeId: string, main: string, secondary?: string) => ({
      placePrediction: {
        placeId,
        text: { text: secondary ? `${main}, ${secondary}` : main },
        structuredFormat: {
          mainText: { text: main },
          ...(secondary ? { secondaryText: { text: secondary } } : {}),
        },
      },
    });

    it('mapeia sugestões de lugar para o DTO', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        okResponse({
          suggestions: [
            suggestion('p1', 'Petshop Amigo Fiel', 'Rua A, 100 - Fortaleza'),
          ],
        }),
      );

      const service = new PlacesService(makeConfig('key'));
      const result = await service.autocomplete({ input: 'petshop' });

      expect(result).toEqual([
        {
          placeId: 'p1',
          mainText: 'Petshop Amigo Fiel',
          secondaryText: 'Rua A, 100 - Fortaleza',
          fullText: 'Petshop Amigo Fiel, Rua A, 100 - Fortaleza',
        },
      ]);
    });

    it('descarta queryPrediction — não é um lugar selecionável', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        okResponse({
          suggestions: [
            { queryPrediction: { text: { text: 'petshop perto de mim' } } },
            suggestion('p1', 'Petshop Amigo Fiel', 'Rua A, 100'),
          ],
        }),
      );

      const service = new PlacesService(makeConfig('key'));
      const result = await service.autocomplete({ input: 'petshop' });

      expect(result.map((s) => s.placeId)).toEqual(['p1']);
    });

    it('cai no texto completo quando falta structuredFormat', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        okResponse({
          suggestions: [
            { placePrediction: { placeId: 'p1', text: { text: 'Rua B, 50' } } },
          ],
        }),
      );

      const service = new PlacesService(makeConfig('key'));
      const [dto] = await service.autocomplete({ input: 'rua b' });

      expect(dto.mainText).toBe('Rua B, 50');
      expect(dto.secondaryText).toBeUndefined();
      expect(dto.fullText).toBe('Rua B, 50');
    });

    it('limita a 5 sugestões', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        okResponse({
          suggestions: Array.from({ length: 9 }, (_, i) =>
            suggestion(`p${i}`, `Lugar ${i}`, 'Rua X'),
          ),
        }),
      );

      const service = new PlacesService(makeConfig('key'));
      const result = await service.autocomplete({ input: 'lugar' });

      expect(result).toHaveLength(5);
    });

    it('não restringe por tipo — endereço avulso precisa aparecer', async () => {
      const fetchMock = jest.fn().mockResolvedValue(okResponse({}));
      global.fetch = fetchMock;

      const service = new PlacesService(makeConfig('key'));
      await service.autocomplete({ input: 'rua das flores' });

      const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(requestInit.body as string) as Record<
        string,
        unknown
      >;
      expect(body).not.toHaveProperty('includedPrimaryTypes');
      expect(body.input).toBe('rua das flores');
    });

    it('envia locationBias e sessionToken quando informados', async () => {
      const fetchMock = jest.fn().mockResolvedValue(okResponse({}));
      global.fetch = fetchMock;

      const service = new PlacesService(makeConfig('key'));
      await service.autocomplete({
        input: 'petshop',
        lat: userLat,
        lng: userLng,
        sessionToken: 'tok-1',
      });

      const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(requestInit.body as string) as {
        sessionToken?: string;
        locationBias?: {
          circle: { center: { latitude: number; longitude: number } };
        };
      };
      expect(body.sessionToken).toBe('tok-1');
      expect(body.locationBias?.circle.center).toEqual({
        latitude: userLat,
        longitude: userLng,
      });
    });

    it('omite locationBias quando não há coordenadas', async () => {
      const fetchMock = jest.fn().mockResolvedValue(okResponse({}));
      global.fetch = fetchMock;

      const service = new PlacesService(makeConfig('key'));
      await service.autocomplete({ input: 'petshop' });

      const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(requestInit.body as string) as Record<
        string,
        unknown
      >;
      expect(body).not.toHaveProperty('locationBias');
      expect(body).not.toHaveProperty('sessionToken');
    });

    it('lança 502 quando a resposta do Google não é ok', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        text: async () => 'quota exceeded',
      });

      const service = new PlacesService(makeConfig('key'));
      expect.assertions(2);
      try {
        await service.autocomplete({ input: 'petshop' });
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(502);
      }
    });
  });

  it('getPhotoUrl monta a URL de mídia com a chave e largura', () => {
    const service = new PlacesService(makeConfig('key-photo'));
    expect(service.getPhotoUrl('places/p/photos/x', 250)).toBe(
      'https://places.googleapis.com/v1/places/p/photos/x/media?maxWidthPx=250&key=key-photo',
    );
  });
});
