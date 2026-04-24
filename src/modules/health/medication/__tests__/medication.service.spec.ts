import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../../prisma/prisma.service';
import { PetService } from '../../../pet/pet.service';
import { MedicationService } from '../medication.service';

describe('MedicationService', () => {
  let service: MedicationService;
  let prisma: {
    medicationRecord: {
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
    id: 'med-1',
    petId: 'pet-1',
    medicationName: 'Amoxicillin',
    dosage: '500mg',
    frequency: '8h',
    startDate: new Date('2026-01-01'),
    endDate: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      medicationRecord: {
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
        MedicationService,
        { provide: PrismaService, useValue: prisma },
        { provide: PetService, useValue: petService },
      ],
    }).compile();

    service = module.get<MedicationService>(MedicationService);
  });

  it('should create a medication after access check', async () => {
    prisma.medicationRecord.create.mockResolvedValue(record);

    await service.create('pet-1', 'auth0|abc', true, {
      medication_name: 'Amoxicillin',
      dosage: '500mg',
      frequency: '8h',
      start_date: '2026-01-01',
    });

    expect(petService.assertAccess).toHaveBeenCalledWith(
      'pet-1',
      'auth0|abc',
      true,
    );
    expect(prisma.medicationRecord.create).toHaveBeenCalled();
  });

  it('should list records ordered by start date', async () => {
    prisma.medicationRecord.findMany.mockResolvedValue([record]);

    const result = await service.findAllForPet('pet-1', 'auth0|abc', false);

    expect(prisma.medicationRecord.findMany).toHaveBeenCalledWith({
      where: { petId: 'pet-1' },
      orderBy: { startDate: 'desc' },
    });
    expect(result).toEqual([
      {
        id: 'med-1',
        pet_id: 'pet-1',
        medication_name: 'Amoxicillin',
        dosage: '500mg',
        frequency: '8h',
        start_date: '2026-01-01',
        end_date: undefined,
        notes: undefined,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      },
    ]);
  });

  it('should throw when updating a missing record', async () => {
    prisma.medicationRecord.findUnique.mockResolvedValue(null);

    await expect(
      service.update('missing', 'auth0|abc', false, {}),
    ).rejects.toThrow(NotFoundException);
  });

  it('should delete an owned record', async () => {
    prisma.medicationRecord.findUnique.mockResolvedValue(record);
    prisma.medicationRecord.delete.mockResolvedValue(record);

    await service.remove('med-1', 'auth0|abc');

    expect(prisma.medicationRecord.delete).toHaveBeenCalledWith({
      where: { id: 'med-1' },
    });
  });
});
