/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import request from 'supertest';
import {
  ControllerHarness,
  createControllerTestApp,
  TUTOR,
  VET,
} from '../../../../test/utils/controller-harness';
import { AnexoController } from '../anexo.controller';
import { AnexoService } from '../anexo.service';
import { ANEXO_MAX_BYTES } from '../anexo-arquivo';
import { CrmvVerificationService } from '../../veterinario/crmv/crmv-verification.service';

const PDF = Buffer.from('%PDF-1.7 conteudo');
const REGISTRO = '11111111-1111-4111-8111-111111111111';

describe('AnexoController (integração)', () => {
  let harness: ControllerHarness;
  let service: {
    criar: jest.Mock;
    linkDoArquivo: jest.Mock;
    verificar: jest.Mock;
    remover: jest.Mock;
  };
  let crmv: { getStatus: jest.Mock };

  beforeAll(async () => {
    service = {
      criar: jest.fn().mockResolvedValue({ id: 'anx-1' }),
      linkDoArquivo: jest.fn().mockResolvedValue({ url: 'https://s3/x' }),
      verificar: jest.fn().mockResolvedValue({ id: 'anx-1', verificado: true }),
      remover: jest.fn().mockResolvedValue(undefined),
    };
    crmv = { getStatus: jest.fn().mockResolvedValue({ verified: true }) };
    harness = await createControllerTestApp({
      controllers: [AnexoController],
      providers: [
        { provide: AnexoService, useValue: service },
        // O guard real roda; só a consulta de verificação é mockada.
        { provide: CrmvVerificationService, useValue: crmv },
      ],
    });
  });

  afterAll(async () => {
    await harness.app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    harness.setUser(TUTOR);
    crmv.getStatus.mockResolvedValue({ verified: true });
  });

  const enviar = () =>
    request(harness.app.getHttpServer())
      .post('/pets/pet-1/anexos')
      .field('entidade', 'VACINA')
      .field('entidade_id', REGISTRO);

  it('POST recebe o multipart e entrega ao serviço com quem enviou (201)', async () => {
    await enviar()
      .attach('file', PDF, {
        filename: 'c.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    expect(service.criar).toHaveBeenCalledWith(
      'pet-1',
      { id: 'tutor-1', isVet: false },
      { entidade: 'VACINA', entidade_id: REGISTRO },
      expect.objectContaining({ mimetype: 'application/pdf' }),
    );
  });

  it('POST recusa entidade fora das três aceitas (400)', async () => {
    await request(harness.app.getHttpServer())
      .post('/pets/pet-1/anexos')
      .field('entidade', 'NOTA_CLINICA')
      .field('entidade_id', REGISTRO)
      .attach('file', PDF, {
        filename: 'c.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);
    expect(service.criar).not.toHaveBeenCalled();
  });

  it('POST recusa entidade_id que não é UUID (400)', async () => {
    await request(harness.app.getHttpServer())
      .post('/pets/pet-1/anexos')
      .field('entidade', 'VACINA')
      .field('entidade_id', 'nao-e-uuid')
      .attach('file', PDF, {
        filename: 'c.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);
  });

  it('POST corta o upload acima de 10 MB antes de chegar ao serviço (413)', async () => {
    await enviar()
      .attach('file', Buffer.alloc(ANEXO_MAX_BYTES + 1), {
        filename: 'c.pdf',
        contentType: 'application/pdf',
      })
      .expect(413);
    expect(service.criar).not.toHaveBeenCalled();
  });

  it('veterinário sem CRMV verificado não anexa (403)', async () => {
    harness.setUser(VET);
    crmv.getStatus.mockResolvedValue({ verified: false });

    await enviar()
      .attach('file', PDF, {
        filename: 'c.pdf',
        contentType: 'application/pdf',
      })
      .expect(403);
    expect(service.criar).not.toHaveBeenCalled();
  });

  it('só veterinário verifica; tutor recebe 403', async () => {
    await request(harness.app.getHttpServer())
      .post('/anexos/anx-1/verificacao')
      .expect(403);
    expect(service.verificar).not.toHaveBeenCalled();

    harness.setUser(VET);
    await request(harness.app.getHttpServer())
      .post('/anexos/anx-1/verificacao')
      .expect(200);
    expect(service.verificar).toHaveBeenCalledWith('anx-1', 'vet-1');
  });

  it('GET arquivo devolve o link e DELETE responde 204', async () => {
    const res = await request(harness.app.getHttpServer())
      .get('/anexos/anx-1/arquivo')
      .expect(200);
    expect(res.body.url).toBe('https://s3/x');

    await request(harness.app.getHttpServer())
      .delete('/anexos/anx-1')
      .expect(204);
    expect(service.remover).toHaveBeenCalledWith('anx-1', {
      id: 'tutor-1',
      isVet: false,
    });
  });

  it('exige autenticação', async () => {
    harness.setUser(null);
    await request(harness.app.getHttpServer())
      .get('/anexos/anx-1/arquivo')
      .expect(401);
  });
});
