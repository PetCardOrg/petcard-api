import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  acaoClinicaProvider,
  comTransacao,
} from '../../../../../test/utils/acao-clinica';
import { PrismaService } from '../../../../prisma/prisma.service';
import { PetService } from '../../../pet/pet.service';
import { VaccineService } from '../vaccine.service';

describe('VaccineService', () => {
  let service: VaccineService;
  let acaoTrilha: ReturnType<typeof acaoClinicaProvider>;
  let registrarAcao: jest.Mock;
  let prisma: {
    vaccineRecord: {
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
    id: 'vac-1',
    petId: 'pet-1',
    veterinarioId: null,
    deletedAt: null,
    vaccineName: 'Rabies',
    appliedAt: new Date('2026-01-01'),
    nextDoseAt: null,
    veterinarianName: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    acaoTrilha = acaoClinicaProvider();
    registrarAcao = acaoTrilha.registrar;
    prisma = {
      vaccineRecord: {
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
        acaoTrilha.provider,
        VaccineService,
        { provide: PrismaService, useValue: prisma },
        { provide: PetService, useValue: petService },
      ],
    }).compile();

    service = module.get<VaccineService>(VaccineService);
  });

  describe('create', () => {
    it('should check pet access before creating the record', async () => {
      prisma.vaccineRecord.create.mockResolvedValue(record);

      await service.create('pet-1', 'tutor-1', false, {
        vaccine_name: 'Rabies',
        applied_at: '2026-01-01',
      });

      expect(petService.assertAccess).toHaveBeenCalledWith(
        'pet-1',
        'tutor-1',
        false,
      );
      expect(prisma.vaccineRecord.create).toHaveBeenCalled();
    });
  });

  describe('findAllForPet', () => {
    it('should return all records for the pet', async () => {
      prisma.vaccineRecord.findMany.mockResolvedValue([record]);

      const result = await service.findAllForPet('pet-1', 'tutor-1', true);

      expect(petService.assertAccess).toHaveBeenCalledWith(
        'pet-1',
        'tutor-1',
        true,
      );
      expect(result).toEqual([
        {
          id: 'vac-1',
          pet_id: 'pet-1',
          vaccine_name: 'Rabies',
          applied_at: '2026-01-01',
          next_dose_at: undefined,
          veterinarian_name: undefined,
          notes: undefined,
          created_at: record.createdAt,
          updated_at: record.updatedAt,
        },
      ]);
    });
  });

  describe('update', () => {
    it('should throw NotFoundException when the record is missing', async () => {
      prisma.vaccineRecord.findFirst.mockResolvedValue(null);

      await expect(
        service.update('missing', 'tutor-1', false, {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update the record when access is granted', async () => {
      prisma.vaccineRecord.findFirst.mockResolvedValue(record);
      prisma.vaccineRecord.update.mockResolvedValue({
        ...record,
        vaccineName: 'Rabies Plus',
      });

      const result = await service.update('vac-1', 'tutor-1', false, {
        vaccine_name: 'Rabies Plus',
      });

      expect(result.vaccine_name).toBe('Rabies Plus');
    });
  });

  describe('remove', () => {
    it('marca como excluído em vez de apagar (api#117)', async () => {
      prisma.vaccineRecord.findFirst.mockResolvedValue(record);
      prisma.vaccineRecord.update.mockResolvedValue(record);

      await service.remove('vac-1', 'tutor-1', false);

      // Ver a nota equivalente no spec do vermífugo: `assertAccess` porque o
      // veterinário também remove; a autoria decide o que ele pode remover.
      expect(petService.assertAccess).toHaveBeenCalledWith(
        'pet-1',
        'tutor-1',
        false,
      );
      // O registro precisa sobreviver: é o que o histórico clínico mostra.
      expect(prisma.vaccineRecord.delete).not.toHaveBeenCalled();
      const [[chamada]] = prisma.vaccineRecord.update.mock.calls as Array<
        [{ where: { id: string }; data: { deletedAt: Date } }]
      >;
      expect(chamada.where).toEqual({ id: 'vac-1' });
      expect(chamada.data.deletedAt).toBeInstanceOf(Date);
    });

    it('registra a exclusão na trilha, com o autor', async () => {
      prisma.vaccineRecord.findFirst.mockResolvedValue(record);
      prisma.vaccineRecord.update.mockResolvedValue(record);

      await service.remove('vac-1', 'tutor-1', false);

      expect(registrarAcao).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: 'EXCLUSAO',
          entidade: 'VACINA',
          entidadeId: 'vac-1',
          autorId: 'tutor-1',
          autorTipo: 'TUTOR',
        }),
        expect.anything(),
      );
    });
  });
  describe('assinatura do veterinário (web#34)', () => {
    it('grava o nome do veterinário logado no registro', async () => {
      prisma.veterinario = { findUnique: jest.fn() } as never;
      (
        prisma as unknown as { veterinario: { findUnique: jest.Mock } }
      ).veterinario.findUnique.mockResolvedValue({ nome: 'Dra. Camila' });
      prisma.vaccineRecord.create.mockResolvedValue(record);

      await service.create('pet-1', 'vet-1', true, {
        vaccine_name: 'Raiva',
        applied_at: '2026-03-10',
      });

      // Resolvido no servidor: aceitar o nome vindo do corpo deixaria assinar
      // um registro clínico com o nome de outra pessoa.
      const [[chamada]] = prisma.vaccineRecord.create.mock.calls as Array<
        [{ data: { veterinarianName?: string; veterinarioId?: string } }]
      >;
      expect(chamada.data.veterinarianName).toBe('Dra. Camila');
      expect(chamada.data.veterinarioId).toBe('vet-1');
    });

    it('respeita o nome digitado quando quem registra é o tutor', async () => {
      prisma.veterinario = { findUnique: jest.fn() } as never;
      prisma.vaccineRecord.create.mockResolvedValue(record);

      await service.create('pet-1', 'tutor-1', false, {
        vaccine_name: 'Raiva',
        applied_at: '2026-03-10',
        veterinarian_name: 'Dr. Fulano (clínica de fora)',
      });

      const [[chamada]] = prisma.vaccineRecord.create.mock.calls as Array<
        [{ data: { veterinarianName?: string; veterinarioId?: string | null } }]
      >;
      expect(chamada.data.veterinarianName).toBe(
        'Dr. Fulano (clínica de fora)',
      );
      expect(chamada.data.veterinarioId).toBeNull();
    });

    it('expõe o veterinario_id na resposta', async () => {
      prisma.vaccineRecord.findMany.mockResolvedValue([
        { ...record, veterinarioId: 'vet-1' },
      ]);

      const [dto] = await service.findAllForPet('pet-1', 'vet-1', true);

      // A tela usa isto para oferecer editar/apagar só no que é do vet.
      expect(dto.veterinario_id).toBe('vet-1');
    });
  });
});
