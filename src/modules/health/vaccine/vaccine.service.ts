import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AcaoClinicaTipo,
  EntidadeClinica,
  Role,
  VaccineRecord,
} from '@prisma/client';
import {
  CreateVaccineRecordDto,
  UpdateVaccineRecordDto,
  VaccineRecordResponseDto,
} from '@petcardorg/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { PetService } from '../../pet/pet.service';
import { AcaoClinicaService } from '../../historico/acao-clinica.service';
import { assertPodeEditar, assertPodeRemover } from '../autoria-clinica';

type VaccineInput = Omit<CreateVaccineRecordDto, 'pet_id'>;

function toResponseDto(record: VaccineRecord): VaccineRecordResponseDto {
  return {
    id: record.id,
    pet_id: record.petId,
    vaccine_name: record.vaccineName,
    applied_at: record.appliedAt.toISOString().split('T')[0],
    next_dose_at: record.nextDoseAt
      ? record.nextDoseAt.toISOString().split('T')[0]
      : undefined,
    veterinarian_name: record.veterinarianName ?? undefined,
    notes: record.notes ?? undefined,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

/** Só os campos clínicos; o snapshot é evidência, não cópia de linha. */
function toSnapshot(record: VaccineRecord) {
  return {
    vaccine_name: record.vaccineName,
    applied_at: record.appliedAt.toISOString(),
    next_dose_at: record.nextDoseAt?.toISOString() ?? null,
    veterinarian_name: record.veterinarianName,
    notes: record.notes,
  };
}

@Injectable()
export class VaccineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly petService: PetService,
    private readonly acoes: AcaoClinicaService,
  ) {}

  async create(
    petId: string,
    userId: string,
    isVet: boolean,
    dto: VaccineInput,
  ): Promise<VaccineRecordResponseDto> {
    await this.petService.assertAccess(petId, userId, isVet);
    const record = await this.prisma.$transaction(async (tx) => {
      const criado = await tx.vaccineRecord.create({
        data: {
          petId,
          vaccineName: dto.vaccine_name,
          appliedAt: new Date(dto.applied_at),
          nextDoseAt: dto.next_dose_at ? new Date(dto.next_dose_at) : null,
          // Atribuição confiável quando quem registra é um vet do PetCard.
          veterinarioId: isVet ? userId : null,
          veterinarianName: dto.veterinarian_name,
          notes: dto.notes,
        },
      });
      await this.acoes.registrar(
        {
          petId,
          tipo: AcaoClinicaTipo.CRIACAO,
          entidade: EntidadeClinica.VACINA,
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
  ): Promise<VaccineRecordResponseDto[]> {
    await this.petService.assertAccess(petId, userId, isVet);
    const records = await this.prisma.vaccineRecord.findMany({
      where: { petId, deletedAt: null },
      orderBy: { appliedAt: 'desc' },
    });
    return records.map(toResponseDto);
  }

  async update(
    id: string,
    userId: string,
    isVet: boolean,
    dto: Omit<UpdateVaccineRecordDto, 'pet_id'>,
  ): Promise<VaccineRecordResponseDto> {
    const record = await this.getRecord(id);
    await this.petService.assertAccess(record.petId, userId, isVet);
    assertPodeEditar(record, userId, isVet);
    const updated = await this.prisma.$transaction(async (tx) => {
      const alterado = await tx.vaccineRecord.update({
        where: { id },
        data: {
          vaccineName: dto.vaccine_name,
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
          entidade: EntidadeClinica.VACINA,
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
   * O tutor deixa de ver o registro, mas o que o veterinário aplicou continua
   * demonstrável.
   */
  async remove(id: string, userId: string, isVet: boolean): Promise<void> {
    const record = await this.getRecord(id);
    await this.petService.assertAccess(record.petId, userId, isVet);
    assertPodeRemover(record, userId, isVet);
    await this.prisma.$transaction(async (tx) => {
      await tx.vaccineRecord.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await this.acoes.registrar(
        {
          petId: record.petId,
          tipo: AcaoClinicaTipo.EXCLUSAO,
          entidade: EntidadeClinica.VACINA,
          entidadeId: id,
          autorId: userId,
          autorTipo: isVet ? Role.VET : Role.TUTOR,
          detalhes: { antes: toSnapshot(record) },
        },
        tx,
      );
    });
  }

  private async getRecord(id: string): Promise<VaccineRecord> {
    const record = await this.prisma.vaccineRecord.findFirst({
      where: { id, deletedAt: null },
    });
    if (!record) {
      throw new NotFoundException(`Vaccine record with id ${id} not found`);
    }
    return record;
  }
}
