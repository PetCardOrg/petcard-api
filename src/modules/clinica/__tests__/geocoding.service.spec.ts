/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-member-access */
import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeocodingService } from '../geocoding.service';

const makeConfig = (key: string | undefined): ConfigService =>
  ({ get: jest.fn().mockReturnValue(key) }) as unknown as ConfigService;

async function expectHttpStatus(
  promise: Promise<unknown>,
  status: number,
): Promise<void> {
  expect.assertions(2);
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(status);
  }
}

describe('GeocodingService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('lança erro no boot quando GOOGLE_MAPS_API_KEY está ausente', () => {
    expect(() => new GeocodingService(makeConfig(undefined))).toThrow(
      'GOOGLE_MAPS_API_KEY',
    );
  });

  it('retorna lat/lng/endereço e envia address+key na URL quando status OK', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      json: async () => ({
        status: 'OK',
        results: [
          {
            geometry: { location: { lat: -3.731, lng: -38.526 } },
            formatted_address: 'Fortaleza - CE, Brasil',
          },
        ],
      }),
    });
    global.fetch = fetchMock;

    const service = new GeocodingService(makeConfig('key-123'));
    const result = await service.geocode('Av. Beira Mar');

    expect(result).toEqual({
      lat: -3.731,
      lng: -38.526,
      formattedAddress: 'Fortaleza - CE, Brasil',
    });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('address=Av.+Beira+Mar');
    expect(calledUrl).toContain('key=key-123');
  });

  it('lança 404 quando o Google retorna ZERO_RESULTS', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ status: 'ZERO_RESULTS', results: [] }),
    });

    const service = new GeocodingService(makeConfig('key'));
    await expectHttpStatus(service.geocode('endereço inexistente'), 404);
  });

  it('lança 502 (BAD_GATEWAY) para qualquer outro status diferente de OK', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ status: 'REQUEST_DENIED', results: [] }),
    });

    const service = new GeocodingService(makeConfig('key'));
    await expectHttpStatus(service.geocode('x'), HttpStatus.BAD_GATEWAY);
  });
});
