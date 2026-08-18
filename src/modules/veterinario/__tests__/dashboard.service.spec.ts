import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { VeterinarioService } from '../veterinario.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
  __esModule: true,
  default: {
    hash: jest.fn().mockResolvedValue('hashed-password'),
    compare: jest.fn(),
  },
}));

describe('VeterinarioService - findAttendedPets', () => {
  let service: VeterinarioService;
  let prisma: {
    notaClinica: { findMany: jest.Mock };
    vaccineRecord: { findMany: jest.Mock };
    dewormingRecord: { findMany: jest.Mock };
    medicationRecord: { findMany: jest.Mock };
    pet: { findMany: jest.Mock };
    veterinario: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  const petFixture = {
    id: 'pet-1',
    name: 'Rex',
    species: 'DOG',
    breed: 'Labrador',
    photoUrl: null,
    tutorId: 'tutor-1',
    tutor: { name: 'Alice' },
  };

  const petFixture2 = {
    id: 'pet-2',
    name: 'Mimi',
    species: 'CAT',
    breed: null,
    photoUrl: null,
    tutorId: 'tutor-2',
    tutor: { name: 'Bob' },
  };

  beforeEach(async () => {
    prisma = {
      notaClinica: { findMany: jest.fn() },
      // O dashboard agora reúne os quatro tipos de registro (web#34).
      vaccineRecord: { findMany: jest.fn().mockResolvedValue([]) },
      dewormingRecord: { findMany: jest.fn().mockResolvedValue([]) },
      medicationRecord: { findMany: jest.fn().mockResolvedValue([]) },
      pet: { findMany: jest.fn() },
      veterinario: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VeterinarioService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<VeterinarioService>(VeterinarioService);
  });

  it('should return pets attended by the authenticated vet', async () => {
    prisma.notaClinica.findMany.mockResolvedValue([
      { petId: 'pet-1', createdAt: new Date('2026-05-30') },
    ]);
    prisma.pet.findMany.mockResolvedValue([petFixture]);

    const result = await service.findAttendedPets('vet-1', {});

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Rex');
    expect(result.items[0].tutor_name).toBe('Alice');
    expect(result.total).toBe(1);
    expect(prisma.notaClinica.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // Nota excluída não traz o pet de volta ao dashboard (api#117).
        where: { veterinarioId: 'vet-1', deletedAt: null },
      }),
    );
  });

  it('should not return pets from another vet', async () => {
    prisma.notaClinica.findMany.mockResolvedValue([]);

    const result = await service.findAttendedPets('vet-other', {});

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('should search by pet name', async () => {
    prisma.notaClinica.findMany.mockResolvedValue([
      { petId: 'pet-1', createdAt: new Date('2026-05-30') },
    ]);
    prisma.pet.findMany.mockResolvedValue([petFixture]);

    const result = await service.findAttendedPets('vet-1', { search: 'Rex' });

    expect(result.items).toHaveLength(1);

    const [[chamada]] = prisma.notaClinica.findMany.mock.calls as Array<
      [{ where: { pet?: { OR?: unknown[] } } }]
    >;
    // A busca passou a filtrar pelo pet, não por campos da nota.
    expect(chamada.where.pet?.OR).toBeDefined();
  });

  it('should search by tutor name', async () => {
    prisma.notaClinica.findMany.mockResolvedValue([
      { petId: 'pet-2', createdAt: new Date('2026-05-28') },
    ]);
    prisma.pet.findMany.mockResolvedValue([petFixture2]);

    const result = await service.findAttendedPets('vet-1', { search: 'Bob' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].tutor_name).toBe('Bob');
  });

  it('should paginate results', async () => {
    prisma.notaClinica.findMany.mockResolvedValue([
      { petId: 'pet-1', createdAt: new Date('2026-05-30') },
      { petId: 'pet-2', createdAt: new Date('2026-05-28') },
    ]);
    prisma.pet.findMany.mockResolvedValue([petFixture]);

    const result = await service.findAttendedPets('vet-1', {
      page: 1,
      pageSize: 1,
    });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(2);
    expect(result.totalPages).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(1);
  });

  it('should return empty list when no notes exist', async () => {
    prisma.notaClinica.findMany.mockResolvedValue([]);

    const result = await service.findAttendedPets('vet-1', {});

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });
  it('traz o pet em que o veterinário só aplicou vacina, sem nota', async () => {
    prisma.notaClinica.findMany.mockResolvedValue([]);
    prisma.vaccineRecord.findMany.mockResolvedValue([
      { petId: 'pet-1', createdAt: new Date('2026-08-18T10:00:00Z') },
    ]);
    prisma.pet.findMany.mockResolvedValue([
      {
        id: 'pet-1',
        name: 'Rex',
        species: 'DOG',
        breed: null,
        photoUrl: null,
        tutor: { name: 'Ana Silva' },
      },
    ]);

    const result = await service.findAttendedPets('vet-1', {});

    // Antes o dashboard olhava só a nota clínica: quem registrava apenas uma
    // vacina perdia o pet da própria lista (web#34).
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Rex');
  });

  it('usa o atendimento mais recente entre os tipos de registro', async () => {
    prisma.notaClinica.findMany.mockResolvedValue([
      { petId: 'pet-1', createdAt: new Date('2026-08-10T10:00:00Z') },
    ]);
    prisma.medicationRecord.findMany.mockResolvedValue([
      { petId: 'pet-1', createdAt: new Date('2026-08-18T10:00:00Z') },
    ]);
    prisma.pet.findMany.mockResolvedValue([
      {
        id: 'pet-1',
        name: 'Rex',
        species: 'DOG',
        breed: null,
        photoUrl: null,
        tutor: { name: 'Ana Silva' },
      },
    ]);

    const result = await service.findAttendedPets('vet-1', {});

    expect(result.items[0].last_attended_at).toEqual(
      new Date('2026-08-18T10:00:00Z'),
    );
  });
});
