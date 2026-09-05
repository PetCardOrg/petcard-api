import request from 'supertest';
import {
  createControllerTestApp,
  ControllerHarness,
  TUTOR,
  VET,
} from '../../../../test/utils/controller-harness';
import { CardController } from '../card.controller';
import { CrmvVerificationService } from '../../veterinario/crmv/crmv-verification.service';
import { CardService } from '../card.service';

describe('CardController — leituras do QR (integração)', () => {
  let harness: ControllerHarness;
  let cardService: {
    registerScan: jest.Mock;
    listScansForTutor: jest.Mock;
    findPublicByToken: jest.Mock;
    findByPetIdForTutor: jest.Mock;
    findClinicaByToken: jest.Mock;
  };

  beforeAll(async () => {
    cardService = {
      registerScan: jest.fn(),
      listScansForTutor: jest.fn(),
      findPublicByToken: jest.fn(),
      findByPetIdForTutor: jest.fn(),
      findClinicaByToken: jest.fn(),
    };

    harness = await createControllerTestApp({
      controllers: [CardController],
      providers: [
        { provide: CardService, useValue: cardService },
        // A rota clínica do controller carrega o CrmvVerifiedGuard; sem este
        // provider o módulo de teste nem compila, mesmo sem exercitar a rota.
        {
          provide: CrmvVerificationService,
          useValue: { estaVerificado: jest.fn().mockResolvedValue(true) },
        },
      ],
    });
  });

  afterAll(async () => {
    await harness.app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    harness.setUser(TUTOR);
  });

  describe('GET /cards/pets/:petId/scans', () => {
    // `@Get(':token')` é catch-all: declarado antes, engoliria este caminho e a
    // rota responderia a carteira pública de um token chamado "pets".
    it('não é capturada pela rota catch-all de token', async () => {
      cardService.listScansForTutor.mockResolvedValue([{ id: 'scan-1' }]);

      const res = await request(harness.app.getHttpServer())
        .get('/cards/pets/pet-1/scans')
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(cardService.listScansForTutor).toHaveBeenCalledWith(
        'pet-1',
        TUTOR.sub,
      );
      expect(cardService.findPublicByToken).not.toHaveBeenCalled();
    });

    it('exige autenticação (401)', async () => {
      harness.setUser(null);

      await request(harness.app.getHttpServer())
        .get('/cards/pets/pet-1/scans')
        .expect(401);
    });

    it('recusa veterinário — o histórico é do tutor dono (403)', async () => {
      harness.setUser(VET);

      await request(harness.app.getHttpServer())
        .get('/cards/pets/pet-1/scans')
        .expect(403);

      expect(cardService.listScansForTutor).not.toHaveBeenCalled();
    });
  });

  describe('POST /cards/:token/scan', () => {
    it('repassa a localização consentida (201)', async () => {
      cardService.registerScan.mockResolvedValue({ id: 'scan-1' });

      await request(harness.app.getHttpServer())
        .post('/cards/tok-abc/scan')
        .send({ latitude: -3.73, longitude: -38.52, accuracy_meters: 12 })
        .expect(201);

      expect(cardService.registerScan).toHaveBeenCalledWith('tok-abc', {
        latitude: -3.73,
        longitude: -38.52,
        accuracy_meters: 12,
      });
    });

    it('aceita body vazio — recusar a localização não pode calar o aviso', async () => {
      cardService.registerScan.mockResolvedValue({ id: 'scan-1' });

      await request(harness.app.getHttpServer())
        .post('/cards/tok-abc/scan')
        .send({})
        .expect(201);

      expect(cardService.registerScan).toHaveBeenCalledWith('tok-abc', {});
    });

    it('rejeita meia coordenada (400)', async () => {
      await request(harness.app.getHttpServer())
        .post('/cards/tok-abc/scan')
        .send({ latitude: -3.73 })
        .expect(400);

      expect(cardService.registerScan).not.toHaveBeenCalled();
    });

    it('rejeita coordenada fora do intervalo (400)', async () => {
      await request(harness.app.getHttpServer())
        .post('/cards/tok-abc/scan')
        .send({ latitude: 120, longitude: -38.52 })
        .expect(400);
    });

    it('rejeita campo desconhecido no corpo (400)', async () => {
      await request(harness.app.getHttpServer())
        .post('/cards/tok-abc/scan')
        .send({ latitude: -3.73, longitude: -38.52, quemEscaneou: 'fulano' })
        .expect(400);

      expect(cardService.registerScan).not.toHaveBeenCalled();
    });
  });
});
