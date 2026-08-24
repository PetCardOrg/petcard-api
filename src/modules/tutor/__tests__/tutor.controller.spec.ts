/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import request from 'supertest';
import {
  createControllerTestApp,
  ControllerHarness,
  TUTOR,
  VET,
} from '../../../../test/utils/controller-harness';
import { PrismaService } from '../../../prisma/prisma.service';
import { TutorController } from '../tutor.controller';
import { TutorService } from '../tutor.service';

describe('TutorController (integração)', () => {
  let harness: ControllerHarness;
  let prisma: {
    tutor: { findUnique: jest.Mock; update: jest.Mock; delete: jest.Mock };
    petAtendido: { findFirst: jest.Mock };
  };

  const tutor = {
    id: 'tutor-1',
    name: 'Alice',
    email: 'tutor@petcard.com',
    // O hash vem do banco em toda leitura; o que importa é ele não sair na
    // resposta.
    password: '$2b$12$hashdoTutor',
    phone: null,
    profileImageUrl: null,
    role: 'TUTOR',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeAll(async () => {
    prisma = {
      tutor: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
      petAtendido: { findFirst: jest.fn() },
    };

    harness = await createControllerTestApp({
      controllers: [TutorController],
      providers: [TutorService, { provide: PrismaService, useValue: prisma }],
    });
  });

  afterAll(async () => {
    await harness.app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    harness.setUser(TUTOR);
    prisma.tutor.findUnique.mockResolvedValue(tutor);
    prisma.petAtendido.findFirst.mockResolvedValue({ id: 'vinculo-1' });
  });

  describe('GET /tutors/me', () => {
    it('retorna o tutor autenticado (200)', async () => {
      const res = await request(harness.app.getHttpServer())
        .get('/tutors/me')
        .expect(200);

      expect(res.body.id).toBe('tutor-1');
      expect(res.body.email).toBe('tutor@petcard.com');
      expect(res.body).not.toHaveProperty('password');
      expect(prisma.tutor.findUnique).toHaveBeenCalledWith({
        where: { id: 'tutor-1' },
      });
    });

    it('exige autenticação (401)', async () => {
      harness.setUser(null);

      await request(harness.app.getHttpServer()).get('/tutors/me').expect(401);
    });
  });

  describe('PATCH /tutors/me', () => {
    it('atualiza o tutor autenticado (200)', async () => {
      prisma.tutor.update.mockResolvedValue({ ...tutor, name: 'Alice B' });

      const res = await request(harness.app.getHttpServer())
        .patch('/tutors/me')
        .send({ name: 'Alice B' })
        .expect(200);

      expect(res.body.name).toBe('Alice B');
      expect(res.body).not.toHaveProperty('password');
      expect(prisma.tutor.update).toHaveBeenCalledWith({
        where: { id: 'tutor-1' },
        data: { name: 'Alice B' },
      });
    });

    it('devolve a foto salva em profile_image_url, não profileImageUrl', async () => {
      // profileImageUrl é o nome do campo no Prisma Client (a coluna é que se
      // chama profile_image_url via @map) — a resposta view precisa da chave
      // em snake_case, que é o que o app mobile lê.
      const url = 'https://bucket.s3.amazonaws.com/tutors/foto.jpg';
      prisma.tutor.update.mockResolvedValue({
        ...tutor,
        profileImageUrl: url,
      });

      const res = await request(harness.app.getHttpServer())
        .patch('/tutors/me')
        .send({ profile_image_url: url })
        .expect(200);

      expect(res.body.profile_image_url).toBe(url);
      expect(res.body).not.toHaveProperty('profileImageUrl');
      expect(prisma.tutor.update).toHaveBeenCalledWith({
        where: { id: 'tutor-1' },
        data: { profileImageUrl: url },
      });
    });

    it('rejeita email inválido (400)', async () => {
      await request(harness.app.getHttpServer())
        .patch('/tutors/me')
        .send({ email: 'not-an-email' })
        .expect(400);

      expect(prisma.tutor.update).not.toHaveBeenCalled();
    });
  });

  describe('GET /tutors/:id', () => {
    it('proíbe acesso de TUTOR (403)', async () => {
      await request(harness.app.getHttpServer())
        .get('/tutors/tutor-1')
        .expect(403);
    });

    it('retorna o tutor para o VET que atende um pet dele (200)', async () => {
      harness.setUser(VET);

      const res = await request(harness.app.getHttpServer())
        .get('/tutors/tutor-1')
        .expect(200);

      expect(res.body.id).toBe('tutor-1');
      expect(res.body).not.toHaveProperty('password');
    });

    it('barra o VET sem pet do tutor na lista (403)', async () => {
      // O papel VET não dá acesso ao cadastro de qualquer tutor da base.
      harness.setUser(VET);
      prisma.petAtendido.findFirst.mockResolvedValue(null);

      await request(harness.app.getHttpServer())
        .get('/tutors/tutor-1')
        .expect(403);
    });

    it('retorna 404 para tutor inexistente (VET)', async () => {
      harness.setUser(VET);
      prisma.tutor.findUnique.mockResolvedValue(null);

      await request(harness.app.getHttpServer())
        .get('/tutors/missing')
        .expect(404);
    });
  });

  describe('DELETE /tutors/me', () => {
    it('apaga a conta do tutor autenticado (204)', async () => {
      prisma.tutor.delete.mockResolvedValue(tutor);

      await request(harness.app.getHttpServer())
        .delete('/tutors/me')
        .expect(204);

      // Sempre a conta de quem está autenticado, nunca um id do corpo.
      expect(prisma.tutor.delete).toHaveBeenCalledWith({
        where: { id: 'tutor-1' },
      });
    });

    it('proíbe VET de apagar conta de tutor (403)', async () => {
      harness.setUser(VET);

      await request(harness.app.getHttpServer())
        .delete('/tutors/me')
        .expect(403);

      expect(prisma.tutor.delete).not.toHaveBeenCalled();
    });

    it('exige autenticação (401)', async () => {
      harness.setUser(null);

      await request(harness.app.getHttpServer())
        .delete('/tutors/me')
        .expect(401);
    });

    it('devolve 404 se a conta já não existe', async () => {
      prisma.tutor.findUnique.mockResolvedValue(null);

      await request(harness.app.getHttpServer())
        .delete('/tutors/me')
        .expect(404);

      expect(prisma.tutor.delete).not.toHaveBeenCalled();
    });
  });
});
