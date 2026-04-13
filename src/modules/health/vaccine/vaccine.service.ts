import { Injectable, NotFoundException } from '@nestjs/common';
import { VaccineRecord } from '@prisma/client';
import {
  CreateVaccineRecordDto,
  UpdateVaccineRecordDto,
} from '@petcardorg/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { PetService } from '../../pet/pet.service';

type VaccineInput = Omit<CreateVaccineRecordDto, 'pet_id'>;

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
  ): Promise<VaccineRecord> {
    await this.petService.assertAccess(petId, auth0Id, isVet);
    return this.prisma.vaccineRecord.create({
      data: {
        petId,
        vaccineName: dto.vaccine_name,
        appliedAt: new Date(dto.applied_at),
        nextDoseAt: dto.next_dose_at ? new Date(dto.next_dose_at) : null,
        veterinarianName: dto.veterinarian_name,
        notes: dto.notes,
      },
    });
  }

  async findAllForPet(
    petId: string,
    auth0Id: string,
    isVet: boolean,
  ): Promise<VaccineRecord[]> {
    await this.petService.assertAccess(petId, auth0Id, isVet);
    return this.prisma.vaccineRecord.findMany({
      where: { petId },
      orderBy: { appliedAt: 'desc' },
    });
  }

  async update(
    id: string,
    auth0Id: string,
    isVet: boolean,
    dto: Omit<UpdateVaccineRecordDto, 'pet_id'>,
  ): Promise<VaccineRecord> {
    const record = await this.getRecord(id);
    await this.petService.assertAccess(record.petId, auth0Id, isVet);
    return this.prisma.vaccineRecord.update({
      where: { id },
      data: {
        vaccineName: dto.vaccine_name,
        appliedAt: dto.applied_at ? new Date(dto.applied_at) : undefined,
        nextDoseAt: dto.next_dose_at ? new Date(dto.next_dose_at) : undefined,
        veterinarianName: dto.veterinarian_name,
        notes: dto.notes,
      },
    });
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
