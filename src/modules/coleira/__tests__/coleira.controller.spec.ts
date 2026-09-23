import request from 'supertest';
import {
  createControllerTestApp,
  ControllerHarness,
  TUTOR,
  VET,
} from '../../../../test/utils/controller-harness';
import { ColeiraController } from '../coleira.controller';
import { ColeiraService } from '../coleira.service';

describe('ColeiraController (integração)', () => {
  let harness: ControllerHarness;
  let coleiraService: {
    registrarLeitura: jest.Mock;
    listScansForTutor: jest.Mock;
    findPublicByToken: jest.Mock;
    findTagForTutor: jest.Mock;
  };

  beforeAll(async () => {
    coleiraService = {
      registrarLeitura: jest.fn(),
      listScansForTutor: jest.fn(),
      findPublicByToken: jest.fn(),
      findTagForTutor: jest.fn(),
    };

    harness = await createControllerTestApp({
      controllers: [ColeiraController],
      providers: [{ provide: ColeiraService, useValue: coleiraService }],
    });
  });

  afterAll(async () => {
    await harness.app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    harness.setUser(TUTOR);
  });

  describe('GET /coleira/pets/:petId/scans', () => {
    // `@Get(':token')` é catch-all: declarado antes, engoliria este caminho e a
    // rota responderia a carteira pública de um token chamado "pets".
    it('não é capturada pela rota catch-all de token', async () => {
      coleiraService.listScansForTutor.mockResolvedValue([{ id: 'scan-1' }]);

      const res = await request(harness.app.getHttpServer())
        .get('/coleira/pets/pet-1/scans')
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(coleiraService.listScansForTutor).toHaveBeenCalledWith(
        'pet-1',
        TUTOR.sub,
      );
      expect(coleiraService.findPublicByToken).not.toHaveBeenCalled();
    });

    it('exige autenticação (401)', async () => {
      harness.setUser(null);

      await request(harness.app.getHttpServer())
        .get('/coleira/pets/pet-1/scans')
        .expect(401);
    });

    it('recusa veterinário — o histórico é do tutor dono (403)', async () => {
      harness.setUser(VET);

      await request(harness.app.getHttpServer())
        .get('/coleira/pets/pet-1/scans')
        .expect(403);

      expect(coleiraService.listScansForTutor).not.toHaveBeenCalled();
    });
  });

  describe('POST /coleira/:token/leitura', () => {
    it('repassa a localização consentida (201)', async () => {
      coleiraService.registrarLeitura.mockResolvedValue({ id: 'scan-1' });

      await request(harness.app.getHttpServer())
        .post('/coleira/tok-abc/leitura')
        .send({ latitude: -3.73, longitude: -38.52, accuracy_meters: 12 })
        .expect(201);

      expect(coleiraService.registrarLeitura).toHaveBeenCalledWith('tok-abc', {
        latitude: -3.73,
        longitude: -38.52,
        accuracy_meters: 12,
      });
    });

    it('aceita body vazio — recusar a localização não pode calar o aviso', async () => {
      coleiraService.registrarLeitura.mockResolvedValue({ id: 'scan-1' });

      await request(harness.app.getHttpServer())
        .post('/coleira/tok-abc/leitura')
        .send({})
        .expect(201);

      expect(coleiraService.registrarLeitura).toHaveBeenCalledWith(
        'tok-abc',
        {},
      );
    });

    it('rejeita meia coordenada (400)', async () => {
      await request(harness.app.getHttpServer())
        .post('/coleira/tok-abc/leitura')
        .send({ latitude: -3.73 })
        .expect(400);

      expect(coleiraService.registrarLeitura).not.toHaveBeenCalled();
    });

    it('rejeita coordenada fora do intervalo (400)', async () => {
      await request(harness.app.getHttpServer())
        .post('/coleira/tok-abc/leitura')
        .send({ latitude: 120, longitude: -38.52 })
        .expect(400);
    });

    it('rejeita campo desconhecido no corpo (400)', async () => {
      await request(harness.app.getHttpServer())
        .post('/coleira/tok-abc/leitura')
        .send({ latitude: -3.73, longitude: -38.52, quemEscaneou: 'fulano' })
        .expect(400);

      expect(coleiraService.registrarLeitura).not.toHaveBeenCalled();
    });
  });
});
