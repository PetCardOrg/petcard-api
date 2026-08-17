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
    notaClinica: { findMany: jest.Mock };
    pet: { findMany: jest.Mock };
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
      notaClinica: { findMany: jest.fn() },
      pet: { findMany: jest.fn() },
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
      prisma.notaClinica.findMany.mockResolvedValue([
        { petId: 'pet-1', createdAt: new Date('2026-02-01') },
      ]);
      prisma.pet.findMany.mockResolvedValue([
        {
          id: 'pet-1',
          name: 'Rex',
          species: 'DOG',
          breed: null,
          photoUrl: null,
          tutor: { name: 'Alice' },
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

  describe('PATCH /veterinarios/:id', () => {
    it('atualiza o veterinário (200)', async () => {
      prisma.veterinario.findUnique.mockResolvedValue(vet);
      prisma.veterinario.update.mockResolvedValue({
        ...vet,
        nome: 'Dra. Nova',
      });

      const res = await request(harness.app.getHttpServer())
        .patch('/veterinarios/vet-1')
        .send({ nome: 'Dra. Nova' })
        .expect(200);

      expect(res.body.nome).toBe('Dra. Nova');
    });
  });

  describe('DELETE /veterinarios/:id', () => {
    it('remove o veterinário (204)', async () => {
      prisma.veterinario.findUnique.mockResolvedValue(vet);
      prisma.veterinario.delete.mockResolvedValue(vet);

      await request(harness.app.getHttpServer())
        .delete('/veterinarios/vet-1')
        .expect(204);
    });
  });
});
