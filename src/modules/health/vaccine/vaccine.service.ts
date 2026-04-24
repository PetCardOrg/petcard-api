import { Injectable, NotFoundException } from '@nestjs/common';
import { VaccineRecord } from '@prisma/client';
import {
  CreateVaccineRecordDto,
  UpdateVaccineRecordDto,
  VaccineRecordResponseDto,
} from '@petcardorg/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { PetService } from '../../pet/pet.service';

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

@Injectable()
export class VaccineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly petService: PetService,
  ) {}

  async create(
    petId: string,
    auth0Id: string,
    isVet: boolean,
    dto: VaccineInput,
  ): Promise<VaccineRecordResponseDto> {
    await this.petService.assertAccess(petId, auth0Id, isVet);
    const record = await this.prisma.vaccineRecord.create({
      data: {
        petId,
        vaccineName: dto.vaccine_name,
        appliedAt: new Date(dto.applied_at),
        nextDoseAt: dto.next_dose_at ? new Date(dto.next_dose_at) : null,
        veterinarianName: dto.veterinarian_name,
        notes: dto.notes,
      },
    });
    return toResponseDto(record);
  }

  async findAllForPet(
    petId: string,
    auth0Id: string,
    isVet: boolean,
  ): Promise<VaccineRecordResponseDto[]> {
    await this.petService.assertAccess(petId, auth0Id, isVet);
    const records = await this.prisma.vaccineRecord.findMany({
      where: { petId },
      orderBy: { appliedAt: 'desc' },
    });
    return records.map(toResponseDto);
  }

  async update(
    id: string,
    auth0Id: string,
    isVet: boolean,
    dto: Omit<UpdateVaccineRecordDto, 'pet_id'>,
  ): Promise<VaccineRecordResponseDto> {
    const record = await this.getRecord(id);
    await this.petService.assertAccess(record.petId, auth0Id, isVet);
    const updated = await this.prisma.vaccineRecord.update({
      where: { id },
      data: {
        vaccineName: dto.vaccine_name,
        appliedAt: dto.applied_at ? new Date(dto.applied_at) : undefined,
        nextDoseAt: dto.next_dose_at ? new Date(dto.next_dose_at) : undefined,
        veterinarianName: dto.veterinarian_name,
        notes: dto.notes,
      },
    });
    return toResponseDto(updated);
  }

  async remove(id: string, auth0Id: string): Promise<void> {
    const record = await this.getRecord(id);
    await this.petService.assertOwnership(record.petId, auth0Id);
    await this.prisma.vaccineRecord.delete({ where: { id } });
  }

  private async getRecord(id: string): Promise<VaccineRecord> {
    const record = await this.prisma.vaccineRecord.findUnique({
      where: { id },
    });
    if (!record) {
      throw new NotFoundException(`Vaccine record with id ${id} not found`);
    }
    return record;
  }
}
