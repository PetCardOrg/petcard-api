import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AcaoClinicaTipo,
  EntidadeClinica,
  NotaClinica,
  NotificationKind,
  Role,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { AcaoClinicaService } from '../historico/acao-clinica.service';
import {
  CreateNotaClinicaDto,
  UpdateNotaClinicaDto,
  NotaClinicaResponseDto,
} from '@petcardorg/shared';

type NotaWithVet = NotaClinica & {
  veterinario: { nome: string; crmv: string };
};

function toResponseDto(nota: NotaWithVet): NotaClinicaResponseDto {
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
    private readonly acoes: AcaoClinicaService,
  ) {}

  async create(
    petId: string,
    veterinarioId: string,
    dto: CreateNotaClinicaDto,
  ): Promise<NotaClinicaResponseDto> {
    const pet = await this.findPetOrFail(petId);
    await this.assertVeterinarioExists(veterinarioId);
    await this.assertVinculoVet(petId, veterinarioId);

    const nota = await this.prisma.$transaction(async (tx) => {
      const criada = await tx.notaClinica.create({
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
      await this.acoes.registrar(
        {
          petId,
          tipo: AcaoClinicaTipo.CRIACAO,
          entidade: EntidadeClinica.NOTA_CLINICA,
          entidadeId: criada.id,
          autorId: veterinarioId,
          autorTipo: Role.VET,
        },
        tx,
      );
      return criada;
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

  async findAllForPet(
    petId: string,
    userId: string,
    isVet: boolean,
  ): Promise<NotaClinicaResponseDto[]> {
    const pet = await this.findPetOrFail(petId);

    if (isVet) {
      await this.assertVinculoVet(petId, userId);
    } else if (pet.tutorId !== userId) {
      throw new ForbiddenException('You can only view notes for your own pets');
    }

    const notas = await this.prisma.notaClinica.findMany({
      where: { petId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { veterinario: { select: { nome: true, crmv: true } } },
    });

    return notas.map(toResponseDto);
  }

  async findOne(
    id: string,
    userId: string,
    isVet: boolean,
  ): Promise<NotaClinicaResponseDto> {
    const nota = await this.prisma.notaClinica.findFirst({
      where: { id, deletedAt: null },
      include: {
        veterinario: { select: { nome: true, crmv: true } },
        pet: { select: { tutorId: true } },
      },
    });

    if (!nota) {
      throw new NotFoundException(`Clinical note with id ${id} not found`);
    }

    if (isVet) {
      await this.assertVinculoVet(nota.petId, userId);
    } else if (nota.pet.tutorId !== userId) {
      throw new ForbiddenException('You can only view notes for your own pets');
    }

    return toResponseDto(nota);
  }

  /**
   * Exclusão lógica (api#117): a nota some da listagem, mas o histórico
   * clínico preserva o que foi diagnosticado e quem diagnosticou.
   */
  /**
   * Edição da própria nota (web#34). Mesma regra da exclusão: só o autor.
   * Alterar nota alheia mantendo a assinatura falsificaria a autoria — a
   * carteira seguiria dizendo quem escreveu, com outro conteúdo.
   */
  async update(
    id: string,
    veterinarioId: string,
    dto: UpdateNotaClinicaDto,
  ): Promise<NotaClinicaResponseDto> {
    const nota = await this.prisma.notaClinica.findFirst({
      where: { id, deletedAt: null },
    });

    if (!nota) {
      throw new NotFoundException(`Clinical note with id ${id} not found`);
    }

    if (nota.veterinarioId !== veterinarioId) {
      throw new ForbiddenException('You can only edit your own clinical notes');
    }

    const atualizada = await this.prisma.$transaction(async (tx) => {
      const alterada = await tx.notaClinica.update({
        where: { id },
        data: {
          diagnostico: dto.diagnostico,
          prescricao: dto.prescricao,
          observacoes: dto.observacoes,
        },
        include: { veterinario: { select: { nome: true, crmv: true } } },
      });
      await this.acoes.registrar(
        {
          petId: nota.petId,
          tipo: AcaoClinicaTipo.EDICAO,
          entidade: EntidadeClinica.NOTA_CLINICA,
          entidadeId: id,
          autorId: veterinarioId,
          autorTipo: Role.VET,
          detalhes: {
            antes: {
              diagnostico: nota.diagnostico,
              prescricao: nota.prescricao,
              observacoes: nota.observacoes,
            },
            depois: {
              diagnostico: alterada.diagnostico,
              prescricao: alterada.prescricao,
              observacoes: alterada.observacoes,
            },
          },
        },
        tx,
      );
      return alterada;
    });

    return toResponseDto(atualizada);
  }

  async remove(id: string, veterinarioId: string): Promise<void> {
    const nota = await this.prisma.notaClinica.findFirst({
      where: { id, deletedAt: null },
    });

    if (!nota) {
      throw new NotFoundException(`Clinical note with id ${id} not found`);
    }

    if (nota.veterinarioId !== veterinarioId) {
      throw new ForbiddenException(
        'You can only delete your own clinical notes',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.notaClinica.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await this.acoes.registrar(
        {
          petId: nota.petId,
          tipo: AcaoClinicaTipo.EXCLUSAO,
          entidade: EntidadeClinica.NOTA_CLINICA,
          entidadeId: id,
          autorId: veterinarioId,
          autorTipo: Role.VET,
          detalhes: {
            antes: {
              diagnostico: nota.diagnostico,
              prescricao: nota.prescricao,
              observacoes: nota.observacoes,
            },
          },
        },
        tx,
      );
    });
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

  /**
   * Exige que o pet esteja na lista de atendidos do veterinário.
   *
   * Repete a regra de `PetService.assertAccess` porque as notas clínicas não
   * passam por lá — e sem a checagem o papel VET, sozinho, lia e escrevia no
   * prontuário de qualquer pet cujo id fosse conhecido. O vínculo entra pela
   * leitura do QR Code da carteira.
   */
  private async assertVinculoVet(
    petId: string,
    veterinarioId: string,
  ): Promise<void> {
    const vinculo = await this.prisma.petAtendido.findUnique({
      where: { veterinarioId_petId: { veterinarioId, petId } },
    });
    if (!vinculo) {
      throw new ForbiddenException(
        'Pet fora da sua lista de atendidos. Leia o QR Code da carteira para iniciar o atendimento.',
      );
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
