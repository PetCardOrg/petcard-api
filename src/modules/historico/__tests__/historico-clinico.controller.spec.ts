/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import request from 'supertest';
import {
  createControllerTestApp,
  ControllerHarness,
  TUTOR,
  VET,
} from '../../../../test/utils/controller-harness';
import { CrmvVerificationService } from '../../veterinario/crmv/crmv-verification.service';
import { HistoricoClinicoController } from '../historico-clinico.controller';
import { HistoricoClinicoService } from '../historico-clinico.service';

describe('HistoricoClinicoController (integração)', () => {
  let harness: ControllerHarness;
  let historico: { doPet: jest.Mock };

  beforeAll(async () => {
    historico = {
      doPet: jest.fn().mockResolvedValue({
        pet_id: 'pet-1',
        pet_nome: 'Rex',
        itens: [],
      }),
    };

    harness = await createControllerTestApp({
      controllers: [HistoricoClinicoController],
      providers: [
        { provide: HistoricoClinicoService, useValue: historico },
        {
          provide: CrmvVerificationService,
          useValue: {
            getStatus: jest.fn().mockResolvedValue({ verified: true }),
          },
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

  it('devolve o histórico para o tutor (200)', async () => {
    const res = await request(harness.app.getHttpServer())
      .get('/pets/pet-1/historico-clinico')
      .expect(200);

    expect(res.body.pet_nome).toBe('Rex');
    expect(historico.doPet).toHaveBeenCalledWith('pet-1', 'tutor-1', false);
  });

  it('marca o solicitante como veterinário quando o papel é VET', async () => {
    harness.setUser(VET);

    await request(harness.app.getHttpServer())
      .get('/pets/pet-1/historico-clinico')
      .expect(200);

    expect(historico.doPet).toHaveBeenCalledWith('pet-1', 'vet-1', true);
  });

  it('exige autenticação (401)', async () => {
    harness.setUser(null);

    await request(harness.app.getHttpServer())
      .get('/pets/pet-1/historico-clinico')
      .expect(401);

    expect(historico.doPet).not.toHaveBeenCalled();
  });
});
