import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Appointment } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PetService } from '../pet/pet.service';
import { CalendarSyncPublisher } from '../queue/calendar-sync.publisher';
import type { AppointmentSyncMessage } from '../queue/dto/calendar-sync.message';
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

/**
 * Folga para o relógio do aparelho atrasado: o app só deixa escolher horário
 * futuro, mas o relógio dele não é o do servidor.
 */
const TOLERANCIA_DO_PASSADO_MS = 5 * 60_000;

/** Recusa agendar para um horário que já passou (AUD API-27). */
function recusarHorarioNoPassado(scheduledAt: Date): void {
  if (scheduledAt.getTime() < Date.now() - TOLERANCIA_DO_PASSADO_MS) {
    throw new BadRequestException(
      'O horário do agendamento já passou. Escolha uma data e hora futuras.',
    );
  }
}

/**
 * Filtro das leituras do tutor. `PENDING_DELETE` é um agendamento excluído
 * cujo evento ainda não saiu do Google: a linha só guarda o google_event_id
 * para o `syncAllPending` (AUD API-25).
 */
const NAO_EXCLUIDO = { not: 'PENDING_DELETE' } as const;

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
  private readonly logger = new Logger(AppointmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calendarSyncPublisher: CalendarSyncPublisher,
    private readonly petService: PetService,
  ) {}

  async create(
    userId: string,
    dto: CreateAppointmentDto,
  ): Promise<AppointmentResponse> {
    recusarHorarioNoPassado(new Date(dto.scheduled_at));
    if (dto.pet_id) {
      await this.petService.assertOwnership(dto.pet_id, userId);
    }

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

    await this.enqueueCalendarSync({
      action: 'CREATE',
      appointment_id: appointment.id,
      tutor_id: userId,
    });

    return toResponse(appointment);
  }

  async findAllForTutor(userId: string): Promise<AppointmentResponse[]> {
    const appointments = await this.prisma.appointment.findMany({
      where: { tutorId: userId, syncStatus: NAO_EXCLUIDO },
      include: { pet: { select: { name: true } } },
      orderBy: { scheduledAt: 'asc' },
    });
    return appointments.map(toResponse);
  }

  async findUpcoming(userId: string): Promise<AppointmentResponse[]> {
    const appointments = await this.prisma.appointment.findMany({
      where: {
        tutorId: userId,
        syncStatus: NAO_EXCLUIDO,
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
    const atual = await this.findAndAssertOwnership(id, userId);
    // Só vale quando o horário muda: um compromisso que já passou continua
    // editável (título, local), e o app reenvia o mesmo scheduled_at.
    if (dto.scheduled_at) {
      const novo = new Date(dto.scheduled_at);
      if (novo.getTime() !== atual.scheduledAt.getTime()) {
        recusarHorarioNoPassado(novo);
      }
    }
    if (dto.pet_id) {
      await this.petService.assertOwnership(dto.pet_id, userId);
    }

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

    await this.enqueueCalendarSync({
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
      const publicado = await this.enqueueCalendarSync({
        action: 'DELETE',
        appointment_id: id,
        tutor_id: userId,
        google_event_id: appointment.googleEventId,
      });
      // Com a fila fora, apagar a linha perderia o único registro do
      // google_event_id e o evento ficaria órfão na agenda. A linha fica
      // escondida até o `syncAllPending` apagar o evento e ela (AUD API-25).
      if (!publicado) {
        await this.prisma.appointment.update({
          where: { id },
          data: { syncStatus: 'PENDING_DELETE' },
        });
        return;
      }
    }

    await this.prisma.appointment.delete({ where: { id } });
  }

  /**
   * O agendamento já está salvo quando a sincronização é publicada: se a fila
   * estiver fora, responder 500 dizia ao cliente que nada foi salvo.
   * A linha fica `PENDING_*`, que o `syncAllPending` recupera; devolve se a
   * publicação deu certo.
   */
  private async enqueueCalendarSync(
    message: AppointmentSyncMessage,
  ): Promise<boolean> {
    try {
      await this.calendarSyncPublisher.publish(message);
      return true;
    } catch {
      // O publisher já logou o erro com a stack; aqui só o destino da linha.
      this.logger.warn(
        `Agendamento ${message.appointment_id} fica pendente (${message.action}) até o próximo syncAllPending`,
      );
      return false;
    }
  }

  private async findAndAssertOwnership(
    id: string,
    userId: string,
  ): Promise<AppointmentWithPet> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: { pet: { select: { name: true } } },
    });
    // Exclusão pendente (AUD API-25): para o tutor, o agendamento já não existe.
    if (!appointment || appointment.syncStatus === 'PENDING_DELETE') {
      throw new NotFoundException(`Appointment with id ${id} not found`);
    }
    if (appointment.tutorId !== userId) {
      throw new ForbiddenException('You do not own this appointment');
    }
    return appointment;
  }
}
