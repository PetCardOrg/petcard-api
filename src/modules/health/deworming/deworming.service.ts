import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AcaoClinicaTipo,
  DewormingRecord,
  EntidadeClinica,
  Role,
} from '@prisma/client';
import {
  CreateDewormingRecordDto,
  DewormingRecordResponseDto,
  UpdateDewormingRecordDto,
} from '@petcardorg/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { PetService } from '../../pet/pet.service';
import { AcaoClinicaService } from '../../historico/acao-clinica.service';
import {
  assertPodeEditar,
  assertPodeRemover,
  nomeDoVeterinario,
} from '../autoria-clinica';

type DewormingInput = Omit<CreateDewormingRecordDto, 'pet_id'>;

function toResponseDto(record: DewormingRecord): DewormingRecordResponseDto {
  return {
    id: record.id,
    pet_id: record.petId,
    product_name: record.productName,
    applied_at: record.appliedAt.toISOString().split('T')[0],
    next_dose_at: record.nextDoseAt
      ? record.nextDoseAt.toISOString().split('T')[0]
      : undefined,
    veterinarian_name: record.veterinarianName ?? undefined,
    veterinario_id: record.veterinarioId ?? undefined,
    notes: record.notes ?? undefined,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

/** Só os campos clínicos; o snapshot é evidência, não cópia de linha. */
function toSnapshot(record: DewormingRecord) {
  return {
    product_name: record.productName,
    applied_at: record.appliedAt.toISOString(),
    next_dose_at: record.nextDoseAt?.toISOString() ?? null,
    veterinarian_name: record.veterinarianName,
    notes: record.notes,
  };
}

@Injectable()
export class DewormingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly petService: PetService,
    private readonly acoes: AcaoClinicaService,
  ) {}

  async create(
    petId: string,
    userId: string,
    isVet: boolean,
    dto: DewormingInput,
  ): Promise<DewormingRecordResponseDto> {
    await this.petService.assertAccess(petId, userId, isVet);
    const record = await this.prisma.$transaction(async (tx) => {
      const criado = await tx.dewormingRecord.create({
        data: {
          petId,
          productName: dto.product_name,
          appliedAt: new Date(dto.applied_at),
          nextDoseAt: dto.next_dose_at ? new Date(dto.next_dose_at) : null,
          veterinarioId: isVet ? userId : null,
          // Assinado com o nome de quem registrou; o texto livre segue
          // valendo para profissional de fora do PetCard.
          veterinarianName: isVet
            ? await nomeDoVeterinario(tx, userId)
            : dto.veterinarian_name,
          notes: dto.notes,
        },
      });
      await this.acoes.registrar(
        {
          petId,
          tipo: AcaoClinicaTipo.CRIACAO,
          entidade: EntidadeClinica.VERMIFUGO,
          entidadeId: criado.id,
          autorId: userId,
          autorTipo: isVet ? Role.VET : Role.TUTOR,
        },
        tx,
      );
      return criado;
    });
    return toResponseDto(record);
  }

  async findAllForPet(
    petId: string,
    userId: string,
    isVet: boolean,
  ): Promise<DewormingRecordResponseDto[]> {
    await this.petService.assertAccess(petId, userId, isVet);
    const records = await this.prisma.dewormingRecord.findMany({
      where: { petId, deletedAt: null },
      orderBy: { appliedAt: 'desc' },
    });
    return records.map(toResponseDto);
  }

  async update(
    id: string,
    userId: string,
    isVet: boolean,
    dto: Omit<UpdateDewormingRecordDto, 'pet_id'>,
  ): Promise<DewormingRecordResponseDto> {
    const record = await this.getRecord(id);
    await this.petService.assertAccess(record.petId, userId, isVet);
    assertPodeEditar(record, userId, isVet);
    const updated = await this.prisma.$transaction(async (tx) => {
      const alterado = await tx.dewormingRecord.update({
        where: { id },
        data: {
          productName: dto.product_name,
          appliedAt: dto.applied_at ? new Date(dto.applied_at) : undefined,
          nextDoseAt: dto.next_dose_at ? new Date(dto.next_dose_at) : undefined,
          veterinarianName: dto.veterinarian_name,
          notes: dto.notes,
        },
      });
      await this.acoes.registrar(
        {
          petId: record.petId,
          tipo: AcaoClinicaTipo.EDICAO,
          entidade: EntidadeClinica.VERMIFUGO,
          entidadeId: id,
          autorId: userId,
          autorTipo: isVet ? Role.VET : Role.TUTOR,
          detalhes: { antes: toSnapshot(record), depois: toSnapshot(alterado) },
        },
        tx,
      );
      return alterado;
    });
    return toResponseDto(updated);
  }

  /**
   * Exclusão lógica (api#117): sai da listagem, permanece no histórico.
   */
  async remove(id: string, userId: string, isVet: boolean): Promise<void> {
    const record = await this.getRecord(id);
    await this.petService.assertAccess(record.petId, userId, isVet);
    assertPodeRemover(record, userId, isVet);
    await this.prisma.$transaction(async (tx) => {
      await tx.dewormingRecord.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await this.acoes.registrar(
        {
          petId: record.petId,
          tipo: AcaoClinicaTipo.EXCLUSAO,
          entidade: EntidadeClinica.VERMIFUGO,
          entidadeId: id,
          autorId: userId,
          autorTipo: isVet ? Role.VET : Role.TUTOR,
          detalhes: { antes: toSnapshot(record) },
        },
        tx,
      );
    });
  }

  private async getRecord(id: string): Promise<DewormingRecord> {
    const record = await this.prisma.dewormingRecord.findFirst({
      where: { id, deletedAt: null },
    });
    if (!record) {
      throw new NotFoundException(`Deworming record with id ${id} not found`);
    }
    return record;
  }
}
