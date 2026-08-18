import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  acaoClinicaProvider,
  comTransacao,
} from '../../../../../test/utils/acao-clinica';
import { PrismaService } from '../../../../prisma/prisma.service';
import { PetService } from '../../../pet/pet.service';
import { MedicationService } from '../medication.service';

describe('MedicationService', () => {
  let service: MedicationService;
  let prisma: {
    medicationRecord: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
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
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    petService = {
      assertAccess: jest.fn().mockResolvedValue({ id: 'pet-1' }),
      assertOwnership: jest.fn().mockResolvedValue({ id: 'pet-1' }),
    };

    comTransacao(prisma);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        acaoClinicaProvider().provider,
        MedicationService,
        { provide: PrismaService, useValue: prisma },
        { provide: PetService, useValue: petService },
      ],
    }).compile();

    service = module.get<MedicationService>(MedicationService);
  });

  it('should create a medication after access check', async () => {
    prisma.medicationRecord.create.mockResolvedValue(record);

    await service.create('pet-1', 'tutor-1', true, {
      medication_name: 'Amoxicillin',
      dosage: '500mg',
      frequency: '8h',
      start_date: '2026-01-01',
    });

    expect(petService.assertAccess).toHaveBeenCalledWith(
      'pet-1',
      'tutor-1',
      true,
    );
    expect(prisma.medicationRecord.create).toHaveBeenCalled();
  });

  it('should list records ordered by start date', async () => {
    prisma.medicationRecord.findMany.mockResolvedValue([record]);

    const result = await service.findAllForPet('pet-1', 'tutor-1', false);

    expect(prisma.medicationRecord.findMany).toHaveBeenCalledWith({
      // Registro excluído não aparece na listagem (api#117).
      where: { petId: 'pet-1', deletedAt: null },
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
    prisma.medicationRecord.findFirst.mockResolvedValue(null);

    await expect(
      service.update('missing', 'tutor-1', false, {}),
    ).rejects.toThrow(NotFoundException);
  });

  it('marca como excluída em vez de apagar (api#117)', async () => {
    prisma.medicationRecord.findFirst.mockResolvedValue(record);
    prisma.medicationRecord.update.mockResolvedValue(record);

    await service.remove('med-1', 'tutor-1');

    // O caso central da issue: o tutor decide não dar o remédio e apaga,
    // mas a prescrição do veterinário continua demonstrável.
    expect(prisma.medicationRecord.delete).not.toHaveBeenCalled();
    const [[chamada]] = prisma.medicationRecord.update.mock.calls as Array<
      [{ where: { id: string }; data: { deletedAt: Date } }]
    >;
    expect(chamada.where).toEqual({ id: 'med-1' });
    expect(chamada.data.deletedAt).toBeInstanceOf(Date);
  });
});
