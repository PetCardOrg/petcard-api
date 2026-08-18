import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AcaoClinicaTipo,
  EntidadeClinica,
  MedicationRecord,
  Role,
} from '@prisma/client';
import {
  CreateMedicationRecordDto,
  MedicationRecordResponseDto,
  UpdateMedicationRecordDto,
} from '@petcardorg/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { PetService } from '../../pet/pet.service';
import { AcaoClinicaService } from '../../historico/acao-clinica.service';
import {
  assertPodeEditar,
  assertPodeRemover,
  nomeDoVeterinario,
} from '../autoria-clinica';

type MedicationInput = Omit<CreateMedicationRecordDto, 'pet_id'>;

function toResponseDto(record: MedicationRecord): MedicationRecordResponseDto {
  return {
    id: record.id,
    pet_id: record.petId,
    medication_name: record.medicationName,
    dosage: record.dosage,
    frequency: record.frequency,
    veterinario_id: record.veterinarioId ?? undefined,
    veterinarian_name: record.veterinarianName ?? undefined,
    start_date: record.startDate.toISOString().split('T')[0],
    end_date: record.endDate
      ? record.endDate.toISOString().split('T')[0]
      : undefined,
    notes: record.notes ?? undefined,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

/** Só os campos clínicos; o snapshot é evidência, não cópia de linha. */
function toSnapshot(record: MedicationRecord) {
  return {
    medication_name: record.medicationName,
    dosage: record.dosage,
    frequency: record.frequency,
    veterinarian_name: record.veterinarianName,
    start_date: record.startDate.toISOString(),
    end_date: record.endDate?.toISOString() ?? null,
    notes: record.notes,
  };
}

@Injectable()
export class MedicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly petService: PetService,
    private readonly acoes: AcaoClinicaService,
  ) {}

  async create(
    petId: string,
    userId: string,
    isVet: boolean,
    dto: MedicationInput,
  ): Promise<MedicationRecordResponseDto> {
    await this.petService.assertAccess(petId, userId, isVet);
    const record = await this.prisma.$transaction(async (tx) => {
      const criado = await tx.medicationRecord.create({
        data: {
          petId,
          medicationName: dto.medication_name,
          dosage: dto.dosage,
          frequency: dto.frequency,
          startDate: new Date(dto.start_date),
          endDate: dto.end_date ? new Date(dto.end_date) : null,
          // Quem prescreveu, quando é um vet do PetCard.
          veterinarioId: isVet ? userId : null,
          // Assinado com o nome de quem prescreveu; o texto livre segue
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
          entidade: EntidadeClinica.MEDICACAO,
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
  ): Promise<MedicationRecordResponseDto[]> {
    await this.petService.assertAccess(petId, userId, isVet);
    const records = await this.prisma.medicationRecord.findMany({
      where: { petId, deletedAt: null },
      orderBy: { startDate: 'desc' },
    });
    return records.map(toResponseDto);
  }

  async update(
    id: string,
    userId: string,
    isVet: boolean,
    dto: Omit<UpdateMedicationRecordDto, 'pet_id'>,
  ): Promise<MedicationRecordResponseDto> {
    const record = await this.getRecord(id);
    await this.petService.assertAccess(record.petId, userId, isVet);
    assertPodeEditar(record, userId, isVet);
    const updated = await this.prisma.$transaction(async (tx) => {
      const alterado = await tx.medicationRecord.update({
        where: { id },
        data: {
          medicationName: dto.medication_name,
          dosage: dto.dosage,
          frequency: dto.frequency,
          veterinarianName: dto.veterinarian_name,
          startDate: dto.start_date ? new Date(dto.start_date) : undefined,
          endDate: dto.end_date ? new Date(dto.end_date) : undefined,
          notes: dto.notes,
        },
      });
      await this.acoes.registrar(
        {
          petId: record.petId,
          tipo: AcaoClinicaTipo.EDICAO,
          entidade: EntidadeClinica.MEDICACAO,
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
   * Exclusão lógica (api#117). É o caso central da issue: o tutor decide não
   * dar o remédio e apaga o registro — a prescrição do veterinário continua
   * no histórico.
   */
  async remove(id: string, userId: string, isVet: boolean): Promise<void> {
    const record = await this.getRecord(id);
    await this.petService.assertAccess(record.petId, userId, isVet);
    assertPodeRemover(record, userId, isVet);
    await this.prisma.$transaction(async (tx) => {
      await tx.medicationRecord.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await this.acoes.registrar(
        {
          petId: record.petId,
          tipo: AcaoClinicaTipo.EXCLUSAO,
          entidade: EntidadeClinica.MEDICACAO,
          entidadeId: id,
          autorId: userId,
          autorTipo: isVet ? Role.VET : Role.TUTOR,
          detalhes: { antes: toSnapshot(record) },
        },
        tx,
      );
    });
  }

  private async getRecord(id: string): Promise<MedicationRecord> {
    const record = await this.prisma.medicationRecord.findFirst({
      where: { id, deletedAt: null },
    });
    if (!record) {
      throw new NotFoundException(`Medication record with id ${id} not found`);
    }
    return record;
  }
}
