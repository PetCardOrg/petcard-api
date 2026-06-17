/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { CalendarSyncPublisher } from '../../queue/calendar-sync.publisher';
import { AppointmentService } from '../appointment.service';
import { CreateAppointmentDto } from '../dto/create-appointment.dto';

describe('AppointmentService', () => {
  let service: AppointmentService;
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

  const now = new Date('2026-05-01T10:00:00Z');
  const appointment = {
    id: 'appt-1',
    tutorId: 'tutor-1',
    title: 'Consulta de rotina',
    description: 'Check-up anual',
    scheduledAt: new Date('2026-06-01T14:00:00Z'),
    durationMinutes: 60,
    location: 'Clínica VetCare',
    petId: 'pet-1',
    googleEventId: null,
    syncStatus: 'PENDING_CREATE',
    createdAt: now,
    updatedAt: now,
    pet: { name: 'Rex' },
  };

  beforeEach(async () => {
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentService,
        { provide: PrismaService, useValue: prisma },
        { provide: CalendarSyncPublisher, useValue: publisher },
      ],
    }).compile();

    service = module.get<AppointmentService>(AppointmentService);
  });

  describe('create', () => {
    it('cria o agendamento do tutor e publica CREATE', async () => {
      prisma.appointment.create.mockResolvedValue(appointment);

      const dto = {
        title: 'Consulta de rotina',
        description: 'Check-up anual',
        scheduled_at: '2026-06-01T14:00:00Z',
        duration_minutes: 60,
        location: 'Clínica VetCare',
        pet_id: 'pet-1',
      } as CreateAppointmentDto;

      const result = await service.create('tutor-1', dto);

      const createArg = prisma.appointment.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(createArg.data).toMatchObject({
        tutorId: 'tutor-1',
        title: 'Consulta de rotina',
        durationMinutes: 60,
        petId: 'pet-1',
      });
      expect(createArg.data.scheduledAt).toBeInstanceOf(Date);
      expect(publisher.publish).toHaveBeenCalledWith({
        action: 'CREATE',
        appointment_id: 'appt-1',
        tutor_id: 'tutor-1',
      });
      expect(result).toMatchObject({
        id: 'appt-1',
        scheduled_at: '2026-06-01T14:00:00.000Z',
        pet_name: 'Rex',
        sync_status: 'PENDING_CREATE',
      });
    });

    it('usa 60 minutos como duração padrão', async () => {
      prisma.appointment.create.mockResolvedValue(appointment);

      await service.create('tutor-1', {
        title: 'X',
        scheduled_at: '2026-06-01T14:00:00Z',
      });

      const createArg = prisma.appointment.create.mock.calls[0][0] as {
        data: { durationMinutes: number };
      };
      expect(createArg.data.durationMinutes).toBe(60);
    });
  });

  describe('findAllForTutor / findUpcoming', () => {
    it('lista todos os agendamentos do tutor', async () => {
      prisma.appointment.findMany.mockResolvedValue([appointment]);

      const result = await service.findAllForTutor('tutor-1');

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tutorId: 'tutor-1' } }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('appt-1');
    });

    it('filtra apenas agendamentos futuros em findUpcoming', async () => {
      prisma.appointment.findMany.mockResolvedValue([]);

      await service.findUpcoming('tutor-1');

      const arg = prisma.appointment.findMany.mock.calls[0][0] as {
        where: { tutorId: string; scheduledAt: { gte: Date } };
      };
      expect(arg.where.tutorId).toBe('tutor-1');
      expect(arg.where.scheduledAt.gte).toBeInstanceOf(Date);
    });
  });

  describe('findOne', () => {
    it('retorna o agendamento do dono', async () => {
      prisma.appointment.findUnique.mockResolvedValue(appointment);

      const result = await service.findOne('appt-1', 'tutor-1');

      expect(result.id).toBe('appt-1');
    });

    it('lança NotFoundException quando não existe', async () => {
      prisma.appointment.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing', 'tutor-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lança ForbiddenException para não-dono', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        ...appointment,
        tutorId: 'other',
      });

      await expect(service.findOne('appt-1', 'tutor-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('update', () => {
    it('atualiza, marca PENDING_UPDATE e publica UPDATE', async () => {
      prisma.appointment.findUnique.mockResolvedValue(appointment);
      prisma.appointment.update.mockResolvedValue({
        ...appointment,
        title: 'Reagendada',
        syncStatus: 'PENDING_UPDATE',
      });

      const result = await service.update('appt-1', 'tutor-1', {
        title: 'Reagendada',
      });

      const updateArg = prisma.appointment.update.mock.calls[0][0] as {
        data: { syncStatus: string };
      };
      expect(updateArg.data.syncStatus).toBe('PENDING_UPDATE');
      expect(publisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'UPDATE', appointment_id: 'appt-1' }),
      );
      expect(result.title).toBe('Reagendada');
    });

    it('recusa update de não-dono sem chamar o banco', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        ...appointment,
        tutorId: 'other',
      });

      await expect(service.update('appt-1', 'tutor-1', {})).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('publica DELETE com o google_event_id quando há evento sincronizado', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        ...appointment,
        googleEventId: 'gcal-123',
      });
      prisma.appointment.delete.mockResolvedValue(appointment);

      await service.remove('appt-1', 'tutor-1');

      expect(publisher.publish).toHaveBeenCalledWith({
        action: 'DELETE',
        appointment_id: 'appt-1',
        tutor_id: 'tutor-1',
        google_event_id: 'gcal-123',
      });
      expect(prisma.appointment.delete).toHaveBeenCalledWith({
        where: { id: 'appt-1' },
      });
    });

    it('não publica DELETE quando não há evento no Google', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        ...appointment,
        googleEventId: null,
      });
      prisma.appointment.delete.mockResolvedValue(appointment);

      await service.remove('appt-1', 'tutor-1');

      expect(publisher.publish).not.toHaveBeenCalled();
      expect(prisma.appointment.delete).toHaveBeenCalled();
    });

    it('lança ForbiddenException e não deleta de não-dono', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        ...appointment,
        tutorId: 'other',
      });

      await expect(service.remove('appt-1', 'tutor-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.appointment.delete).not.toHaveBeenCalled();
    });
  });
});
