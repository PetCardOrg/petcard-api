/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { CreateAppointmentDto } from '@petcardorg/shared';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { PetService } from '../../pet/pet.service';
import { CalendarSyncPublisher } from '../../queue/calendar-sync.publisher';
import { AppointmentService } from '../appointment.service';

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
  let petService: { assertOwnership: jest.Mock };

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
    petService = {
      assertOwnership: jest.fn().mockResolvedValue({ id: 'pet-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentService,
        { provide: PrismaService, useValue: prisma },
        { provide: CalendarSyncPublisher, useValue: publisher },
        { provide: PetService, useValue: petService },
      ],
    }).compile();

    service = module.get<AppointmentService>(AppointmentService);

    // As datas dos casos são relativas a `now`: sem fixar o relógio, o
    // agendamento de junho de 2026 vira passado e a regra do API-27 recusa.
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

    it('responde com o agendamento salvo se a fila estiver fora, e ele fica PENDING_CREATE (AUD API-08)', async () => {
      prisma.appointment.create.mockResolvedValue(appointment);
      publisher.publish.mockRejectedValue(new Error('broker down'));

      const result = await service.create('tutor-1', {
        title: 'Consulta de rotina',
        scheduled_at: '2026-06-01T14:00:00Z',
      });

      expect(result.id).toBe('appt-1');
      expect(result.sync_status).toBe('PENDING_CREATE');
    });

    it('confere a posse do pet antes de criar o agendamento', async () => {
      prisma.appointment.create.mockResolvedValue(appointment);

      await service.create('tutor-1', {
        title: 'Consulta de rotina',
        scheduled_at: '2026-06-01T14:00:00Z',
        pet_id: 'pet-1',
      });

      expect(petService.assertOwnership).toHaveBeenCalledWith(
        'pet-1',
        'tutor-1',
      );
    });

    it('recusa agendar com pet_id de outro tutor e não grava nada (api#audit-1)', async () => {
      petService.assertOwnership.mockRejectedValue(
        new ForbiddenException('You do not own this pet'),
      );

      await expect(
        service.create('tutor-1', {
          title: 'Consulta de rotina',
          scheduled_at: '2026-06-01T14:00:00Z',
          pet_id: 'pet-de-outro-tutor',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('não confere posse quando o agendamento não referencia um pet', async () => {
      prisma.appointment.create.mockResolvedValue({
        ...appointment,
        petId: null,
        pet: null,
      });

      await service.create('tutor-1', {
        title: 'Consulta de rotina',
        scheduled_at: '2026-06-01T14:00:00Z',
      });

      expect(petService.assertOwnership).not.toHaveBeenCalled();
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
        expect.objectContaining({
          where: { tutorId: 'tutor-1', syncStatus: { not: 'PENDING_DELETE' } },
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('appt-1');
    });

    it('esconde o agendamento com exclusão pendente das duas listagens (AUD API-25)', async () => {
      prisma.appointment.findMany.mockResolvedValue([]);

      await service.findAllForTutor('tutor-1');
      await service.findUpcoming('tutor-1');

      for (const [arg] of prisma.appointment.findMany.mock.calls as [
        { where: { syncStatus: unknown } },
      ][]) {
        expect(arg.where.syncStatus).toEqual({ not: 'PENDING_DELETE' });
      }
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

    it('lança NotFoundException para agendamento com exclusão pendente (AUD API-25)', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        ...appointment,
        syncStatus: 'PENDING_DELETE',
      });

      await expect(service.findOne('appt-1', 'tutor-1')).rejects.toThrow(
        NotFoundException,
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

    it('responde com o agendamento salvo se a fila estiver fora, e ele fica PENDING_UPDATE (AUD API-08)', async () => {
      prisma.appointment.findUnique.mockResolvedValue(appointment);
      prisma.appointment.update.mockResolvedValue({
        ...appointment,
        title: 'Reagendada',
        syncStatus: 'PENDING_UPDATE',
      });
      publisher.publish.mockRejectedValue(new Error('broker down'));

      const result = await service.update('appt-1', 'tutor-1', {
        title: 'Reagendada',
      });

      expect(result.sync_status).toBe('PENDING_UPDATE');
      expect(result.title).toBe('Reagendada');
    });

    it('confere a posse do novo pet_id antes de atualizar', async () => {
      prisma.appointment.findUnique.mockResolvedValue(appointment);
      prisma.appointment.update.mockResolvedValue(appointment);

      await service.update('appt-1', 'tutor-1', { pet_id: 'pet-2' });

      expect(petService.assertOwnership).toHaveBeenCalledWith(
        'pet-2',
        'tutor-1',
      );
    });

    it('recusa trocar pet_id para pet de outro tutor e não grava nada (api#audit-1)', async () => {
      prisma.appointment.findUnique.mockResolvedValue(appointment);
      petService.assertOwnership.mockRejectedValue(
        new ForbiddenException('You do not own this pet'),
      );

      await expect(
        service.update('appt-1', 'tutor-1', {
          pet_id: 'pet-de-outro-tutor',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.appointment.update).not.toHaveBeenCalled();
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

    it('reagendar (scheduled_at novo) zera lastNotifiedAt para liberar um novo lembrete (api#111)', async () => {
      prisma.appointment.findUnique.mockResolvedValue(appointment);
      prisma.appointment.update.mockResolvedValue(appointment);

      await service.update('appt-1', 'tutor-1', {
        scheduled_at: '2026-07-01T14:00:00Z',
      });

      const updateArg = prisma.appointment.update.mock.calls[0][0] as {
        data: { lastNotifiedAt: unknown };
      };
      expect(updateArg.data.lastNotifiedAt).toBeNull();
    });

    it('não mexe em lastNotifiedAt quando o update não reagenda', async () => {
      prisma.appointment.findUnique.mockResolvedValue(appointment);
      prisma.appointment.update.mockResolvedValue(appointment);

      await service.update('appt-1', 'tutor-1', { title: 'Novo título' });

      const updateArg = prisma.appointment.update.mock.calls[0][0] as {
        data: { lastNotifiedAt: unknown };
      };
      expect(updateArg.data.lastNotifiedAt).toBeUndefined();
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

    // Apagar a linha com a fila fora deixava o evento órfão no Google: nada
    // mais sabia o google_event_id. A linha fica para o syncAllPending.
    it('com a fila fora, marca PENDING_DELETE em vez de apagar a linha (AUD API-25)', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        ...appointment,
        googleEventId: 'gcal-123',
      });
      publisher.publish.mockRejectedValue(new Error('broker down'));

      await expect(
        service.remove('appt-1', 'tutor-1'),
      ).resolves.toBeUndefined();
      expect(prisma.appointment.update).toHaveBeenCalledWith({
        where: { id: 'appt-1' },
        data: { syncStatus: 'PENDING_DELETE' },
      });
      expect(prisma.appointment.delete).not.toHaveBeenCalled();
    });

    it('excluir de novo um agendamento com exclusão pendente dá 404 (AUD API-25)', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        ...appointment,
        googleEventId: 'gcal-123',
        syncStatus: 'PENDING_DELETE',
      });

      await expect(service.remove('appt-1', 'tutor-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(publisher.publish).not.toHaveBeenCalled();
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

  describe('horário no passado (AUD API-27)', () => {
    const ontem = '2026-04-30T10:00:00Z';
    const passado = { ...appointment, scheduledAt: new Date(ontem) };

    it('recusa criar agendamento para ontem, sem gravar nada', async () => {
      await expect(
        service.create('tutor-1', {
          title: 'Consulta',
          scheduled_at: ontem,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('aceita alguns minutos de atraso do relógio do aparelho', async () => {
      prisma.appointment.create.mockResolvedValue(appointment);

      await service.create('tutor-1', {
        title: 'Consulta',
        scheduled_at: '2026-05-01T09:58:00Z',
      });

      expect(prisma.appointment.create).toHaveBeenCalled();
    });

    it('recusa remarcar para o passado', async () => {
      prisma.appointment.findUnique.mockResolvedValue(appointment);

      await expect(
        service.update('appt-1', 'tutor-1', { scheduled_at: ontem }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('deixa editar só o título de um compromisso que já passou', async () => {
      prisma.appointment.findUnique.mockResolvedValue(passado);
      prisma.appointment.update.mockResolvedValue(passado);

      await service.update('appt-1', 'tutor-1', { title: 'Retorno' });

      expect(prisma.appointment.update).toHaveBeenCalled();
    });

    // O app manda o formulário inteiro na edição, com o mesmo scheduled_at.
    it('aceita o mesmo horário passado reenviado junto com outros campos', async () => {
      prisma.appointment.findUnique.mockResolvedValue(passado);
      prisma.appointment.update.mockResolvedValue(passado);

      await service.update('appt-1', 'tutor-1', {
        title: 'Retorno',
        scheduled_at: '2026-04-30T10:00:00.000Z',
      });

      expect(prisma.appointment.update).toHaveBeenCalled();
    });
  });
});
