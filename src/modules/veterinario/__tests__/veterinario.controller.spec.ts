/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import request from 'supertest';
import {
  createControllerTestApp,
  ControllerHarness,
  VET,
} from '../../../../test/utils/controller-harness';
import { PrismaService } from '../../../prisma/prisma.service';
import { VeterinarioController } from '../veterinario.controller';
import { VeterinarioService } from '../veterinario.service';
import { CrmvVerificationService } from '../crmv/crmv-verification.service';

describe('VeterinarioController (integração)', () => {
  let harness: ControllerHarness;
  let prisma: {
    veterinario: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    petAtendido: {
      count: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
      delete: jest.Mock;
    };
    carteiraDigital: { findUnique: jest.Mock };
  };
  let crmv: { getStatus: jest.Mock; verify: jest.Mock };

  const vet = {
    id: 'vet-1',
    nome: 'Dra. Vet',
    email: 'vet@petcard.com',
    crmv: 'CRMV-123',
    telefone: null,
    password: 'hash',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeAll(async () => {
    prisma = {
      veterinario: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      petAtendido: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
      carteiraDigital: { findUnique: jest.fn() },
    };
    crmv = {
      getStatus: jest.fn().mockResolvedValue({ verified: false }),
      verify: jest.fn().mockResolvedValue({ verified: true }),
    };

    harness = await createControllerTestApp({
      controllers: [VeterinarioController],
      providers: [
        VeterinarioService,
        { provide: PrismaService, useValue: prisma },
        { provide: CrmvVerificationService, useValue: crmv },
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

  describe('CRMV do próprio veterinário', () => {
    it('GET /veterinarios/me/crmv devolve a situação (200)', async () => {
      const res = await request(harness.app.getHttpServer())
        .get('/veterinarios/me/crmv')
        .expect(200);

      expect(res.body.verified).toBe(false);
    });

    it('POST /veterinarios/me/crmv/verificar dispara a consulta (200)', async () => {
      const res = await request(harness.app.getHttpServer())
        .post('/veterinarios/me/crmv/verificar')
        .expect(200);

      expect(res.body.verified).toBe(true);
      expect(crmv.verify).toHaveBeenCalledWith('vet-1', false);
    });

    it('POST .../verificar?force=true reconsulta mesmo dentro do prazo', async () => {
      await request(harness.app.getHttpServer())
        .post('/veterinarios/me/crmv/verificar?force=true')
        .expect(200);

      expect(crmv.verify).toHaveBeenCalledWith('vet-1', true);
    });
  });

  describe('GET /veterinarios', () => {
    it('lista os veterinários (200)', async () => {
      prisma.veterinario.findMany.mockResolvedValue([vet]);

      const res = await request(harness.app.getHttpServer())
        .get('/veterinarios')
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].password).toBeUndefined();
    });
  });

  describe('GET /veterinarios/dashboard/pets', () => {
    it('retorna os pets atendidos paginados (200)', async () => {
      prisma.petAtendido.count.mockResolvedValue(1);
      prisma.petAtendido.findMany.mockResolvedValue([
        {
          id: 'v-1',
          ultimoAcessoEm: new Date('2026-02-01'),
          pet: {
            id: 'pet-1',
            name: 'Rex',
            species: 'DOG',
            breed: null,
            photoUrl: null,
            tutor: { name: 'Alice' },
          },
        },
      ]);

      const res = await request(harness.app.getHttpServer())
        .get('/veterinarios/dashboard/pets')
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.items[0].tutor_name).toBe('Alice');
    });

    it('rejeita page inválida na query (400)', async () => {
      await request(harness.app.getHttpServer())
        .get('/veterinarios/dashboard/pets?page=0')
        .expect(400);
    });
  });

  describe('POST /veterinarios/me/pets', () => {
    beforeEach(() => {
      crmv.getStatus.mockResolvedValue({ verified: true });
      prisma.carteiraDigital.findUnique.mockResolvedValue({
        petId: 'pet-1',
        pet: { id: 'pet-1', name: 'Rex' },
      });
      prisma.petAtendido.upsert.mockResolvedValue({
        id: 'v-1',
        createdAt: new Date('2026-08-19'),
      });
    });

    it('adiciona o pet lido no QR à lista do veterinário (200)', async () => {
      const res = await request(harness.app.getHttpServer())
        .post('/veterinarios/me/pets')
        .send({ token: 'token-abc' })
        .expect(200);

      expect(res.body).toMatchObject({ pet_id: 'pet-1', novo: true });
    });

    it('recusa veterinário sem CRMV verificado (403)', async () => {
      crmv.getStatus.mockResolvedValue({ verified: false });

      await request(harness.app.getHttpServer())
        .post('/veterinarios/me/pets')
        .send({ token: 'token-abc' })
        .expect(403);
    });

    it('rejeita corpo sem token (400)', async () => {
      await request(harness.app.getHttpServer())
        .post('/veterinarios/me/pets')
        .send({})
        .expect(400);
    });
  });

  describe('DELETE /veterinarios/me/pets/:petId', () => {
    it('tira o pet da lista (204)', async () => {
      prisma.petAtendido.findUnique.mockResolvedValue({ id: 'v-1' });

      await request(harness.app.getHttpServer())
        .delete('/veterinarios/me/pets/pet-1')
        .expect(204);

      expect(prisma.petAtendido.delete).toHaveBeenCalled();
    });

    it('404 quando o pet não está na lista', async () => {
      // clearAllMocks zera chamadas, não implementações: sem isto o vínculo
      // do teste anterior continuaria valendo.
      prisma.petAtendido.findUnique.mockResolvedValue(null);

      await request(harness.app.getHttpServer())
        .delete('/veterinarios/me/pets/pet-alheio')
        .expect(404);
    });
  });

  describe('GET /veterinarios/:id', () => {
    it('retorna o veterinário (200)', async () => {
      prisma.veterinario.findUnique.mockResolvedValue(vet);

      const res = await request(harness.app.getHttpServer())
        .get('/veterinarios/vet-1')
        .expect(200);

      expect(res.body.id).toBe('vet-1');
    });

    it('retorna 404 para id inexistente', async () => {
      prisma.veterinario.findUnique.mockResolvedValue(null);

      await request(harness.app.getHttpServer())
        .get('/veterinarios/missing')
        .expect(404);
    });
  });

  describe('cadastro do próprio veterinário', () => {
    it('PATCH /veterinarios/me altera quem está no token (200)', async () => {
      prisma.veterinario.findUnique.mockResolvedValue(vet);
      prisma.veterinario.update.mockResolvedValue({
        ...vet,
        nome: 'Dra. Nova',
      });

      const res = await request(harness.app.getHttpServer())
        .patch('/veterinarios/me')
        .send({ nome: 'Dra. Nova' })
        .expect(200);

      expect(res.body.nome).toBe('Dra. Nova');
      // O alvo vem do token, nunca da rota: é o que impede um veterinário
      // de editar o cadastro de outro.
      expect(prisma.veterinario.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: VET.sub } }),
      );
    });

    it('DELETE /veterinarios/me apaga a própria conta (204)', async () => {
      prisma.veterinario.findUnique.mockResolvedValue(vet);
      prisma.veterinario.delete.mockResolvedValue(vet);

      await request(harness.app.getHttpServer())
        .delete('/veterinarios/me')
        .expect(204);

      expect(prisma.veterinario.delete).toHaveBeenCalledWith({
        where: { id: VET.sub },
      });
    });

    it('não expõe rota para alterar o cadastro de outro veterinário (404)', async () => {
      // Havia PATCH/DELETE /veterinarios/:id sem checagem de posse: qualquer
      // veterinário autenticado alterava a conta de outro passando o id.
      await request(harness.app.getHttpServer())
        .patch('/veterinarios/vet-2')
        .send({ nome: 'Invadida' })
        .expect(404);

      await request(harness.app.getHttpServer())
        .delete('/veterinarios/vet-2')
        .expect(404);

      expect(prisma.veterinario.update).not.toHaveBeenCalled();
      expect(prisma.veterinario.delete).not.toHaveBeenCalled();
    });
  });
});
