import { Injectable, NotFoundException } from '@nestjs/common';
import { DewormingRecord } from '@prisma/client';
import {
  CreateDewormingRecordDto,
  UpdateDewormingRecordDto,
} from '@petcardorg/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { PetService } from '../../pet/pet.service';

type DewormingInput = Omit<CreateDewormingRecordDto, 'pet_id'>;

@Injectable()
export class DewormingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly petService: PetService,
  ) {}

  async create(
    petId: string,
    auth0Id: string,
    isVet: boolean,
    dto: DewormingInput,
  ): Promise<DewormingRecord> {
    await this.petService.assertAccess(petId, auth0Id, isVet);
    return this.prisma.dewormingRecord.create({
      data: {
        petId,
        productName: dto.product_name,
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
  ): Promise<DewormingRecord[]> {
    await this.petService.assertAccess(petId, auth0Id, isVet);
    return this.prisma.dewormingRecord.findMany({
      where: { petId },
      orderBy: { appliedAt: 'desc' },
    });
  }

  async update(
    id: string,
    auth0Id: string,
    isVet: boolean,
    dto: Omit<UpdateDewormingRecordDto, 'pet_id'>,
  ): Promise<DewormingRecord> {
    const record = await this.getRecord(id);
    await this.petService.assertAccess(record.petId, auth0Id, isVet);
    return this.prisma.dewormingRecord.update({
      where: { id },
      data: {
        productName: dto.product_name,
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
    await this.prisma.dewormingRecord.delete({ where: { id } });
  }

  private async getRecord(id: string): Promise<DewormingRecord> {
    const record = await this.prisma.dewormingRecord.findUnique({
      where: { id },
    });
    if (!record) {
      throw new NotFoundException(`Deworming record with id ${id} not found`);
    }
    return record;
  }
}
