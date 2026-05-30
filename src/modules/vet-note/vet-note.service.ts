import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotaClinica, NotificationKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { CreateVetNoteDto } from './dto/create-vet-note.dto';

export interface VetNoteResponseDto {
  id: string;
  pet_id: string;
  veterinario_id: string;
  veterinario_nome: string;
  veterinario_crmv: string;
  google_place_id?: string;
  diagnostico: string;
  prescricao?: string;
  observacoes?: string;
  created_at: Date;
  updated_at: Date;
}

type NotaWithVet = NotaClinica & {
  veterinario: { nome: string; crmv: string };
};

function toResponseDto(nota: NotaWithVet): VetNoteResponseDto {
  return {
    id: nota.id,
    pet_id: nota.petId,
    veterinario_id: nota.veterinarioId,
    veterinario_nome: nota.veterinario.nome,
    veterinario_crmv: nota.veterinario.crmv,
    google_place_id: nota.googlePlaceId ?? undefined,
    diagnostico: nota.diagnostico,
    prescricao: nota.prescricao ?? undefined,
    observacoes: nota.observacoes ?? undefined,
    created_at: nota.createdAt,
    updated_at: nota.updatedAt,
  };
}

@Injectable()
export class VetNoteService {
  private readonly logger = new Logger(VetNoteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  async create(
    petId: string,
    veterinarioId: string,
    dto: CreateVetNoteDto,
  ): Promise<VetNoteResponseDto> {
    const pet = await this.findPetOrFail(petId);
    await this.assertVeterinarioExists(veterinarioId);

    const nota = await this.prisma.notaClinica.create({
      data: {
        petId,
        veterinarioId,
        diagnostico: dto.diagnostico,
        prescricao: dto.prescricao,
        observacoes: dto.observacoes,
        googlePlaceId: dto.google_place_id,
      },
      include: { veterinario: { select: { nome: true, crmv: true } } },
    });

    const response = toResponseDto(nota);

    try {
      await this.notificationService.schedulePush({
        tutorId: pet.tutorId,
        kind: NotificationKind.CLINICAL_NOTE,
        referenceType: 'CLINICAL_NOTE',
        referenceId: nota.id,
        title: 'Nova nota clínica',
        body: `${nota.veterinario.nome} adicionou uma nota clínica para ${pet.name}`,
        data: {
          pet_id: petId,
          clinical_note_id: nota.id,
          type: 'clinical_note',
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to schedule push notification for clinical note ${nota.id}`,
        error instanceof Error ? error.stack : error,
      );
    }

    return response;
  }

  async findAllForPet(petId: string): Promise<VetNoteResponseDto[]> {
    await this.findPetOrFail(petId);

    const notas = await this.prisma.notaClinica.findMany({
      where: { petId },
      orderBy: { createdAt: 'desc' },
      include: { veterinario: { select: { nome: true, crmv: true } } },
    });

    return notas.map(toResponseDto);
  }

  async findOne(id: string): Promise<VetNoteResponseDto> {
    const nota = await this.prisma.notaClinica.findUnique({
      where: { id },
      include: { veterinario: { select: { nome: true, crmv: true } } },
    });

    if (!nota) {
      throw new NotFoundException(`Clinical note with id ${id} not found`);
    }

    return toResponseDto(nota);
  }

  async remove(id: string, veterinarioId: string): Promise<void> {
    const nota = await this.prisma.notaClinica.findUnique({ where: { id } });

    if (!nota) {
      throw new NotFoundException(`Clinical note with id ${id} not found`);
    }

    if (nota.veterinarioId !== veterinarioId) {
      throw new ForbiddenException(
        'You can only delete your own clinical notes',
      );
    }

    await this.prisma.notaClinica.delete({ where: { id } });
  }

  private async findPetOrFail(
    petId: string,
  ): Promise<{ id: string; name: string; tutorId: string }> {
    const pet = await this.prisma.pet.findUnique({
      where: { id: petId },
      select: { id: true, name: true, tutorId: true },
    });
    if (!pet) {
      throw new NotFoundException(`Pet with id ${petId} not found`);
    }
    return pet;
  }

  private async assertVeterinarioExists(veterinarioId: string): Promise<void> {
    const vet = await this.prisma.veterinario.findUnique({
      where: { id: veterinarioId },
    });
    if (!vet) {
      throw new NotFoundException(
        `Veterinario with id ${veterinarioId} not found`,
      );
    }
  }
}
