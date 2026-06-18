/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import request from 'supertest';
import {
  createControllerTestApp,
  ControllerHarness,
  TUTOR,
  VET,
} from '../../../../test/utils/controller-harness';
import { PrismaService } from '../../../prisma/prisma.service';
import { CalendarSyncPublisher } from '../../queue/calendar-sync.publisher';
import { AppointmentController } from '../appointment.controller';
import { AppointmentService } from '../appointment.service';

describe('AppointmentController (integração)', () => {
  let harness: ControllerHarness;
  let prisma: {
    appointment: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let publisher: { publish: jest.Mock };

  const appointment = {
    id: 'appt-1',
    tutorId: 'tutor-1',
    title: 'Consulta de rotina',
    description: null,
    scheduledAt: new Date('2026-06-01T14:00:00Z'),
    durationMinutes: 60,
    location: null,
    petId: null,
    googleEventId: null,
    syncStatus: 'PENDING_CREATE',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    pet: null,
  };

  beforeAll(async () => {
    prisma = {
      appointment: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    publisher = { publish: jest.fn().mockResolvedValue(undefined) };

    harness = await createControllerTestApp({
      controllers: [AppointmentController],
      providers: [
        AppointmentService,
        { provide: PrismaService, useValue: prisma },
        { provide: CalendarSyncPublisher, useValue: publisher },
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

  describe('POST /appointments', () => {
    it('cria o agendamento e publica CREATE (201)', async () => {
      prisma.appointment.create.mockResolvedValue(appointment);

      const res = await request(harness.app.getHttpServer())
        .post('/appointments')
        .send({
          title: 'Consulta de rotina',
          scheduled_at: '2026-06-01T14:00:00Z',
        })
        .expect(201);

      expect(res.body.id).toBe('appt-1');
      expect(publisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', appointment_id: 'appt-1' }),
      );
    });

    it('rejeita título curto / data ausente (400)', async () => {
      await request(harness.app.getHttpServer())
        .post('/appointments')
        .send({ title: 'x' })
        .expect(400);

      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('proíbe VET de criar agendamento (403)', async () => {
      harness.setUser(VET);

      await request(harness.app.getHttpServer())
        .post('/appointments')
        .send({ title: 'Consulta', scheduled_at: '2026-06-01T14:00:00Z' })
        .expect(403);
    });
  });

  describe('GET /appointments', () => {
    it('lista todos os agendamentos do tutor (200)', async () => {
      prisma.appointment.findMany.mockResolvedValue([appointment]);

      const res = await request(harness.app.getHttpServer())
        .get('/appointments')
        .expect(200);

      expect(res.body).toHaveLength(1);
    });

    it('filtra os futuros com upcoming=true (200)', async () => {
      prisma.appointment.findMany.mockResolvedValue([]);

      await request(harness.app.getHttpServer())
        .get('/appointments?upcoming=true')
        .expect(200);

      const arg = prisma.appointment.findMany.mock.calls[0][0];
      expect(arg.where.scheduledAt.gte).toBeInstanceOf(Date);
    });
  });

  describe('GET /appointments/:id', () => {
    it('retorna o agendamento do dono (200)', async () => {
      prisma.appointment.findUnique.mockResolvedValue(appointment);

      const res = await request(harness.app.getHttpServer())
        .get('/appointments/appt-1')
        .expect(200);

      expect(res.body.id).toBe('appt-1');
    });

    it('retorna 404 quando não existe', async () => {
      prisma.appointment.findUnique.mockResolvedValue(null);

      await request(harness.app.getHttpServer())
        .get('/appointments/missing')
        .expect(404);
    });
  });

  describe('PATCH /appointments/:id', () => {
    it('atualiza e publica UPDATE (200)', async () => {
      prisma.appointment.findUnique.mockResolvedValue(appointment);
      prisma.appointment.update.mockResolvedValue({
        ...appointment,
        title: 'Reagendada',
      });

      const res = await request(harness.app.getHttpServer())
        .patch('/appointments/appt-1')
        .send({ title: 'Reagendada' })
        .expect(200);

      expect(res.body.title).toBe('Reagendada');
    });
  });

  describe('DELETE /appointments/:id', () => {
    it('remove o agendamento do dono (204)', async () => {
      prisma.appointment.findUnique.mockResolvedValue(appointment);
      prisma.appointment.delete.mockResolvedValue(appointment);

      await request(harness.app.getHttpServer())
        .delete('/appointments/appt-1')
        .expect(204);
    });
  });
});
