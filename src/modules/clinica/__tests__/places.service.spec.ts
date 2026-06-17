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
      radiusMeters: 1000,
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

  it('inclui openNow no corpo da requisição quando solicitado', async () => {
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
    const body = JSON.parse(requestInit.body as string) as {
      openNow?: boolean;
      includedTypes: string[];
    };
    expect(body.openNow).toBe(true);
    expect(body.includedTypes).toContain('veterinary_care');
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

  it('getPhotoUrl monta a URL de mídia com a chave e largura', () => {
    const service = new PlacesService(makeConfig('key-photo'));
    expect(service.getPhotoUrl('places/p/photos/x', 250)).toBe(
      'https://places.googleapis.com/v1/places/p/photos/x/media?maxWidthPx=250&key=key-photo',
    );
  });
});
