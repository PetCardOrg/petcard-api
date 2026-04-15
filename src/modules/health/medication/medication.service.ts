import { Injectable, NotFoundException } from '@nestjs/common';
import { MedicationRecord } from '@prisma/client';
import {
  CreateMedicationRecordDto,
  UpdateMedicationRecordDto,
} from '@petcardorg/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { PetService } from '../../pet/pet.service';

type MedicationInput = Omit<CreateMedicationRecordDto, 'pet_id'>;

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
  ): Promise<MedicationRecord> {
    await this.petService.assertAccess(petId, auth0Id, isVet);
    return this.prisma.medicationRecord.create({
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
  }

  async findAllForPet(
    petId: string,
    auth0Id: string,
    isVet: boolean,
  ): Promise<MedicationRecord[]> {
    await this.petService.assertAccess(petId, auth0Id, isVet);
    return this.prisma.medicationRecord.findMany({
      where: { petId },
      orderBy: { startDate: 'desc' },
    });
  }

  async update(
    id: string,
    auth0Id: string,
    isVet: boolean,
    dto: Omit<UpdateMedicationRecordDto, 'pet_id'>,
  ): Promise<MedicationRecord> {
    const record = await this.getRecord(id);
    await this.petService.assertAccess(record.petId, auth0Id, isVet);
    return this.prisma.medicationRecord.update({
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
