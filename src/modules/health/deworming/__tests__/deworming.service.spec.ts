import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../../prisma/prisma.service';
import { PetService } from '../../../pet/pet.service';
import { DewormingService } from '../deworming.service';

describe('DewormingService', () => {
  let service: DewormingService;
  let prisma: {
    dewormingRecord: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let petService: {
    assertAccess: jest.Mock;
    assertOwnership: jest.Mock;
  };

  const record = {
    id: 'dew-1',
    petId: 'pet-1',
    productName: 'Drontal',
    appliedAt: new Date('2026-01-01'),
    nextDoseAt: null,
    veterinarianName: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      dewormingRecord: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    petService = {
      assertAccess: jest.fn().mockResolvedValue({ id: 'pet-1' }),
      assertOwnership: jest.fn().mockResolvedValue({ id: 'pet-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DewormingService,
        { provide: PrismaService, useValue: prisma },
        { provide: PetService, useValue: petService },
      ],
    }).compile();

    service = module.get<DewormingService>(DewormingService);
  });

  it('should create a record after access check', async () => {
    prisma.dewormingRecord.create.mockResolvedValue(record);

    await service.create('pet-1', 'tutor-1', false, {
      product_name: 'Drontal',
      applied_at: '2026-01-01',
    });

    expect(petService.assertAccess).toHaveBeenCalled();
    expect(prisma.dewormingRecord.create).toHaveBeenCalled();
  });

  it('should list records for a pet', async () => {
    prisma.dewormingRecord.findMany.mockResolvedValue([record]);

    const result = await service.findAllForPet('pet-1', 'tutor-1', false);

    expect(result).toEqual([
      {
        id: 'dew-1',
        pet_id: 'pet-1',
        product_name: 'Drontal',
        applied_at: '2026-01-01',
        next_dose_at: undefined,
        veterinarian_name: undefined,
        notes: undefined,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      },
    ]);
  });

  it('should throw when updating missing record', async () => {
    prisma.dewormingRecord.findUnique.mockResolvedValue(null);

    await expect(
      service.update('missing', 'tutor-1', false, {}),
    ).rejects.toThrow(NotFoundException);
  });

  it('should delete owned record', async () => {
    prisma.dewormingRecord.findUnique.mockResolvedValue(record);
    prisma.dewormingRecord.delete.mockResolvedValue(record);

    await service.remove('dew-1', 'tutor-1');

    expect(petService.assertOwnership).toHaveBeenCalledWith('pet-1', 'tutor-1');
  });
});
