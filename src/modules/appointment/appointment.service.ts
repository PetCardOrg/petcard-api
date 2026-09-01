import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Appointment } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CalendarSyncPublisher } from '../queue/calendar-sync.publisher';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

export type AppointmentResponse = {
  id: string;
  title: string;
  description?: string;
  scheduled_at: string;
  duration_minutes: number;
  location?: string;
  pet_id?: string;
  pet_name?: string;
  sync_status: string;
  created_at: Date;
  updated_at: Date;
};

type AppointmentWithPet = Appointment & {
  pet?: { name: string } | null;
};

function toResponse(a: AppointmentWithPet): AppointmentResponse {
  return {
    id: a.id,
    title: a.title,
    description: a.description ?? undefined,
    scheduled_at: a.scheduledAt.toISOString(),
    duration_minutes: a.durationMinutes,
    location: a.location ?? undefined,
    pet_id: a.petId ?? undefined,
    pet_name: a.pet?.name ?? undefined,
    sync_status: a.syncStatus,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
  };
}

@Injectable()
export class AppointmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendarSyncPublisher: CalendarSyncPublisher,
  ) {}

  async create(
    userId: string,
    dto: CreateAppointmentDto,
  ): Promise<AppointmentResponse> {
    const appointment = await this.prisma.appointment.create({
      data: {
        tutorId: userId,
        title: dto.title,
        description: dto.description,
        scheduledAt: new Date(dto.scheduled_at),
        durationMinutes: dto.duration_minutes ?? 60,
        location: dto.location,
        petId: dto.pet_id,
      },
      include: { pet: { select: { name: true } } },
    });

    await this.calendarSyncPublisher.publish({
      action: 'CREATE',
      appointment_id: appointment.id,
      tutor_id: userId,
    });

    return toResponse(appointment);
  }

  async findAllForTutor(userId: string): Promise<AppointmentResponse[]> {
    const appointments = await this.prisma.appointment.findMany({
      where: { tutorId: userId },
      include: { pet: { select: { name: true } } },
      orderBy: { scheduledAt: 'asc' },
    });
    return appointments.map(toResponse);
  }

  async findUpcoming(userId: string): Promise<AppointmentResponse[]> {
    const appointments = await this.prisma.appointment.findMany({
      where: {
        tutorId: userId,
        scheduledAt: { gte: new Date() },
      },
      include: { pet: { select: { name: true } } },
      orderBy: { scheduledAt: 'asc' },
    });
    return appointments.map(toResponse);
  }

  async findOne(id: string, userId: string): Promise<AppointmentResponse> {
    const appointment = await this.findAndAssertOwnership(id, userId);
    return toResponse(appointment);
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateAppointmentDto,
  ): Promise<AppointmentResponse> {
    await this.findAndAssertOwnership(id, userId);

    const appointment = await this.prisma.appointment.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        scheduledAt: dto.scheduled_at ? new Date(dto.scheduled_at) : undefined,
        durationMinutes: dto.duration_minutes,
        location: dto.location,
        petId: dto.pet_id,
        syncStatus: 'PENDING_UPDATE',
        // Reagendar libera um novo lembrete para o horário novo (api#111) —
        // sem isto o cron nunca mais avisaria, porque já tinha notificado
        // para o horário antigo.
        lastNotifiedAt: dto.scheduled_at ? null : undefined,
      },
      include: { pet: { select: { name: true } } },
    });

    await this.calendarSyncPublisher.publish({
      action: 'UPDATE',
      appointment_id: appointment.id,
      tutor_id: userId,
    });

    return toResponse(appointment);
  }

  async remove(id: string, userId: string): Promise<void> {
    const appointment = await this.findAndAssertOwnership(id, userId);

    // Capture the event id before deleting the row — the worker needs it to
    // call the Calendar API after the appointment is gone from the DB.
    if (appointment.googleEventId) {
      await this.calendarSyncPublisher.publish({
        action: 'DELETE',
        appointment_id: id,
        tutor_id: userId,
        google_event_id: appointment.googleEventId,
      });
    }

    await this.prisma.appointment.delete({ where: { id } });
  }

  private async findAndAssertOwnership(
    id: string,
    userId: string,
  ): Promise<AppointmentWithPet> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: { pet: { select: { name: true } } },
    });
    if (!appointment) {
      throw new NotFoundException(`Appointment with id ${id} not found`);
    }
    if (appointment.tutorId !== userId) {
      throw new ForbiddenException('You do not own this appointment');
    }
    return appointment;
  }
}
