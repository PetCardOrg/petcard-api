import { Injectable, NotFoundException } from '@nestjs/common';
import { MedicationRecord } from '@prisma/client';
import {
  CreateMedicationRecordDto,
  MedicationRecordResponseDto,
  UpdateMedicationRecordDto,
} from '@petcardorg/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { PetService } from '../../pet/pet.service';

type MedicationInput = Omit<CreateMedicationRecordDto, 'pet_id'>;

function toResponseDto(record: MedicationRecord): MedicationRecordResponseDto {
  return {
    id: record.id,
    pet_id: record.petId,
    medication_name: record.medicationName,
    dosage: record.dosage,
    frequency: record.frequency,
    start_date: record.startDate.toISOString().split('T')[0],
    end_date: record.endDate
      ? record.endDate.toISOString().split('T')[0]
      : undefined,
    notes: record.notes ?? undefined,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

@Injectable()
export class MedicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly petService: PetService,
  ) {}

  async create(
    petId: string,
    auth0Id: string,
    isVet: boolean,
    dto: MedicationInput,
  ): Promise<MedicationRecordResponseDto> {
    await this.petService.assertAccess(petId, auth0Id, isVet);
    const record = await this.prisma.medicationRecord.create({
      data: {
        petId,
        medicationName: dto.medication_name,
        dosage: dto.dosage,
        frequency: dto.frequency,
        startDate: new Date(dto.start_date),
        endDate: dto.end_date ? new Date(dto.end_date) : null,
        notes: dto.notes,
      },
    });
    return toResponseDto(record);
  }

  async findAllForPet(
    petId: string,
    auth0Id: string,
    isVet: boolean,
  ): Promise<MedicationRecordResponseDto[]> {
    await this.petService.assertAccess(petId, auth0Id, isVet);
    const records = await this.prisma.medicationRecord.findMany({
      where: { petId },
      orderBy: { startDate: 'desc' },
    });
    return records.map(toResponseDto);
  }

  async update(
    id: string,
    auth0Id: string,
    isVet: boolean,
    dto: Omit<UpdateMedicationRecordDto, 'pet_id'>,
  ): Promise<MedicationRecordResponseDto> {
    const record = await this.getRecord(id);
    await this.petService.assertAccess(record.petId, auth0Id, isVet);
    const updated = await this.prisma.medicationRecord.update({
      where: { id },
      data: {
        medicationName: dto.medication_name,
        dosage: dto.dosage,
        frequency: dto.frequency,
        startDate: dto.start_date ? new Date(dto.start_date) : undefined,
        endDate: dto.end_date ? new Date(dto.end_date) : undefined,
        notes: dto.notes,
      },
    });
    return toResponseDto(updated);
  }

  async remove(id: string, auth0Id: string): Promise<void> {
    const record = await this.getRecord(id);
    await this.petService.assertOwnership(record.petId, auth0Id);
    await this.prisma.medicationRecord.delete({ where: { id } });
  }

  private async getRecord(id: string): Promise<MedicationRecord> {
    const record = await this.prisma.medicationRecord.findUnique({
      where: { id },
    });
    if (!record) {
      throw new NotFoundException(`Medication record with id ${id} not found`);
    }
    return record;
  }
}
