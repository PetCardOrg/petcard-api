import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotaClinica } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

  async create(
    petId: string,
    veterinarioId: string,
    dto: CreateVetNoteDto,
  ): Promise<VetNoteResponseDto> {
    await this.assertPetExists(petId);
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

    return toResponseDto(nota);
  }

  async findAllForPet(petId: string): Promise<VetNoteResponseDto[]> {
    await this.assertPetExists(petId);

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

  private async assertPetExists(petId: string): Promise<void> {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) {
      throw new NotFoundException(`Pet with id ${petId} not found`);
    }
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
