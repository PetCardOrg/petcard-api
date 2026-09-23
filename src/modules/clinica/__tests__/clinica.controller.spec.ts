/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { BadRequestException } from '@nestjs/common';
import request from 'supertest';
import {
  createControllerTestApp,
  ControllerHarness,
  VET,
} from '../../../../test/utils/controller-harness';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { ClinicaController } from '../clinica.controller';
import { GeocodingService } from '../geocoding.service';
import { PlacesService } from '../places.service';

describe('ClinicaController (integração)', () => {
  let harness: ControllerHarness;
  let places: {
    searchNearbyVetClinics: jest.Mock;
    autocomplete: jest.Mock;
    fetchPhoto: jest.Mock;
  };
  let geocoding: { geocode: jest.Mock };

  beforeAll(async () => {
    places = {
      searchNearbyVetClinics: jest.fn(),
      autocomplete: jest.fn(),
      fetchPhoto: jest.fn(),
    };
    geocoding = { geocode: jest.fn() };

    harness = await createControllerTestApp({
      controllers: [ClinicaController],
      providers: [
        { provide: PlacesService, useValue: places },
        { provide: GeocodingService, useValue: geocoding },
      ],
    });
  });

  afterAll(async () => {
    await harness.app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    harness.setUser(VET);
  });

  describe('GET /clinicas/places', () => {
    it('converte radiusKm em metros e retorna as clínicas (200)', async () => {
      places.searchNearbyVetClinics.mockResolvedValue([{ place_id: 'p1' }]);

      const res = await request(harness.app.getHttpServer())
        .get('/clinicas/places?lat=-3.73&lng=-38.52&radiusKm=2')
        .expect(200);

      expect(res.body).toHaveLength(1);
      const arg = places.searchNearbyVetClinics.mock.calls[0][0];
      expect(arg.radiusMeters).toBe(2000);
      expect(arg.lat).toBe(-3.73);
    });

    it('rejeita lat/lng ausentes (400)', async () => {
      await request(harness.app.getHttpServer())
        .get('/clinicas/places?radiusKm=2')
        .expect(400);

      expect(places.searchNearbyVetClinics).not.toHaveBeenCalled();
    });

    it('rejeita radiusKm fora do intervalo (400)', async () => {
      await request(harness.app.getHttpServer())
        .get('/clinicas/places?lat=-3.73&lng=-38.52&radiusKm=999')
        .expect(400);
    });

    it('exige autenticação (401)', async () => {
      harness.setUser(null);

      await request(harness.app.getHttpServer())
        .get('/clinicas/places?lat=-3.73&lng=-38.52&radiusKm=2')
        .expect(401);
    });
  });

  describe('GET /clinicas/autocomplete', () => {
    it('repassa o viés de localização e devolve as sugestões (200)', async () => {
      places.autocomplete.mockResolvedValue([
        { placeId: 'p1', mainText: 'Petshop Amigo', fullText: 'Petshop Amigo' },
      ]);

      const res = await request(harness.app.getHttpServer())
        .get(
          '/clinicas/autocomplete?input=petshop&lat=-3.73&lng=-38.52&sessionToken=abc',
        )
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(places.autocomplete).toHaveBeenCalledWith({
        input: 'petshop',
        lat: -3.73,
        lng: -38.52,
        sessionToken: 'abc',
      });
    });

    it('aceita busca sem localização — a permissão pode estar negada (200)', async () => {
      places.autocomplete.mockResolvedValue([]);

      await request(harness.app.getHttpServer())
        .get('/clinicas/autocomplete?input=rua das flores')
        .expect(200);

      const arg = places.autocomplete.mock.calls[0][0];
      expect(arg.lat).toBeUndefined();
      expect(arg.lng).toBeUndefined();
    });

    it('rejeita input curto demais sem chamar o Google (400)', async () => {
      await request(harness.app.getHttpServer())
        .get('/clinicas/autocomplete?input=pe')
        .expect(400);

      expect(places.autocomplete).not.toHaveBeenCalled();
    });

    it('exige autenticação (401)', async () => {
      harness.setUser(null);

      await request(harness.app.getHttpServer())
        .get('/clinicas/autocomplete?input=petshop')
        .expect(401);
    });
  });

  describe('GET /clinicas/geocode', () => {
    it('retorna as coordenadas do endereço (200)', async () => {
      geocoding.geocode.mockResolvedValue({ lat: -3.73, lng: -38.52 });

      const res = await request(harness.app.getHttpServer())
        .get('/clinicas/geocode?address=Fortaleza')
        .expect(200);

      expect(res.body.lat).toBe(-3.73);
      expect(geocoding.geocode).toHaveBeenCalledWith('Fortaleza');
    });
  });

  describe('GET /clinicas/fotos/:token', () => {
    it('devolve os bytes e o content-type da foto (200)', async () => {
      places.fetchPhoto.mockResolvedValue({
        contentType: 'image/jpeg',
        body: Buffer.from('foto-fake'),
      });

      const res = await request(harness.app.getHttpServer())
        .get('/clinicas/fotos/tok-abc')
        .expect(200);

      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(Buffer.from(res.body as Buffer)).toEqual(Buffer.from('foto-fake'));
      expect(places.fetchPhoto).toHaveBeenCalledWith('tok-abc');
    });

    it('propaga o erro de token inválido/expirado (400)', async () => {
      places.fetchPhoto.mockRejectedValue(
        new BadRequestException('Token de foto inválido.'),
      );

      await request(harness.app.getHttpServer())
        .get('/clinicas/fotos/token-invalido')
        .expect(400);
    });

    // A harness mocka o JwtAuthGuard direto (sempre exige `currentUser`), então
    // não reproduz o bypass real do `@Public()` — a metadata é o que a
    // proteção de fato depende, e é o que este teste garante que não regride.
    it('é pública — a rota carrega a metadata do @Public()', () => {
      const isPublic = Reflect.getMetadata(
        IS_PUBLIC_KEY,
        // eslint-disable-next-line @typescript-eslint/unbound-method -- só lida a metadata, não chama o método
        ClinicaController.prototype.foto,
      ) as boolean | undefined;

      expect(isPublic).toBe(true);
    });
  });
});
