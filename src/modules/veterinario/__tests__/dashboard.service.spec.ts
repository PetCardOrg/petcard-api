import { NotFoundException } from '@nestjs/common';
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

describe('VeterinarioService - lista de pets atendidos', () => {
  let service: VeterinarioService;
  let prisma: {
    petAtendido: {
      count: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
      delete: jest.Mock;
    };
    carteiraDigital: { findUnique: jest.Mock };
    veterinario: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  const vinculo = (
    pet: Record<string, unknown>,
    ultimoAcessoEm = new Date('2026-08-18T10:00:00Z'),
  ) => ({ id: `v-${String(pet.id)}`, ultimoAcessoEm, pet });

  const rex = {
    id: 'pet-1',
    name: 'Rex',
    species: 'DOG',
    breed: 'Labrador',
    photoUrl: null,
    tutorId: 'tutor-1',
    tutor: { name: 'Alice' },
  };

  const mimi = {
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
      petAtendido: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
      carteiraDigital: { findUnique: jest.fn() },
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

  describe('findAttendedPets', () => {
    it('lista os pets vinculados ao veterinário autenticado', async () => {
      prisma.petAtendido.count.mockResolvedValue(1);
      prisma.petAtendido.findMany.mockResolvedValue([vinculo(rex)]);

      const result = await service.findAttendedPets('vet-1', {});

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Rex');
      expect(result.items[0].tutor_name).toBe('Alice');
      expect(result.total).toBe(1);
      const [[chamada]] = prisma.petAtendido.findMany.mock.calls as Array<
        [{ where: { veterinarioId: string } }]
      >;
      expect(chamada.where.veterinarioId).toBe('vet-1');
    });

    it('mantém o pet na lista mesmo sem registro clínico vivo', async () => {
      // O defeito que motivou o vínculo: a lista era derivada dos registros,
      // então o veterinário que apagasse os próprios via o pet sumir.
      prisma.petAtendido.count.mockResolvedValue(1);
      prisma.petAtendido.findMany.mockResolvedValue([vinculo(rex)]);

      const result = await service.findAttendedPets('vet-1', {});

      expect(result.items).toHaveLength(1);
      const [[chamada]] = prisma.petAtendido.findMany.mock.calls as Array<
        [{ where: Record<string, unknown> }]
      >;
      expect(chamada.where).not.toHaveProperty('deletedAt');
    });

    it('não devolve pet de outro veterinário', async () => {
      const result = await service.findAttendedPets('vet-other', {});

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('busca por nome do pet', async () => {
      prisma.petAtendido.count.mockResolvedValue(1);
      prisma.petAtendido.findMany.mockResolvedValue([vinculo(rex)]);

      const result = await service.findAttendedPets('vet-1', { search: 'Rex' });

      expect(result.items).toHaveLength(1);
      const [[chamada]] = prisma.petAtendido.findMany.mock.calls as Array<
        [{ where: { pet?: { OR?: unknown[] } } }]
      >;
      expect(chamada.where.pet?.OR).toHaveLength(2);
    });

    it('busca por nome do tutor', async () => {
      prisma.petAtendido.count.mockResolvedValue(1);
      prisma.petAtendido.findMany.mockResolvedValue([vinculo(mimi)]);

      const result = await service.findAttendedPets('vet-1', { search: 'Bob' });

      expect(result.items[0].tutor_name).toBe('Bob');
    });

    it('pagina o resultado', async () => {
      prisma.petAtendido.count.mockResolvedValue(2);
      prisma.petAtendido.findMany.mockResolvedValue([vinculo(rex)]);

      const result = await service.findAttendedPets('vet-1', {
        page: 1,
        pageSize: 1,
      });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(2);
      expect(result.totalPages).toBe(2);
      expect(prisma.petAtendido.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 1 }),
      );
    });

    it('ordena pelo atendimento mais recente', async () => {
      prisma.petAtendido.count.mockResolvedValue(1);
      prisma.petAtendido.findMany.mockResolvedValue([
        vinculo(rex, new Date('2026-08-19T09:00:00Z')),
      ]);

      const result = await service.findAttendedPets('vet-1', {});

      expect(result.items[0].last_attended_at).toEqual(
        new Date('2026-08-19T09:00:00Z'),
      );
      expect(prisma.petAtendido.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { ultimoAcessoEm: 'desc' } }),
      );
    });

    it('devolve lista vazia quando o veterinário não atendeu ninguém', async () => {
      const result = await service.findAttendedPets('vet-1', {});

      expect(result.items).toHaveLength(0);
      expect(result.totalPages).toBe(1);
    });
  });

  describe('adicionarPetPorToken', () => {
    beforeEach(() => {
      prisma.carteiraDigital.findUnique.mockResolvedValue({
        petId: 'pet-1',
        pet: { id: 'pet-1', name: 'Rex' },
      });
      prisma.petAtendido.upsert.mockResolvedValue({
        id: 'v-1',
        createdAt: new Date('2026-08-19T12:00:00Z'),
      });
    });

    it('vincula o pet ao veterinário que leu o QR', async () => {
      const result = await service.adicionarPetPorToken('vet-1', 'token-abc');

      expect(result).toMatchObject({
        pet_id: 'pet-1',
        pet_nome: 'Rex',
        novo: true,
      });
      expect(prisma.petAtendido.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { veterinarioId: 'vet-1', petId: 'pet-1' },
        }),
      );
    });

    it('reabrir a carteira não duplica: só atualiza o atendimento', async () => {
      prisma.petAtendido.findUnique.mockResolvedValue({ id: 'v-1' });

      const result = await service.adicionarPetPorToken('vet-1', 'token-abc');

      expect(result.novo).toBe(false);
      const [[chamada]] = prisma.petAtendido.upsert.mock.calls as Array<
        [{ update: { ultimoAcessoEm: Date } }]
      >;
      expect(chamada.update.ultimoAcessoEm).toBeInstanceOf(Date);
    });

    it('404 quando o token não corresponde a nenhuma carteira', async () => {
      prisma.carteiraDigital.findUnique.mockResolvedValue(null);

      await expect(
        service.adicionarPetPorToken('vet-1', 'token-inexistente'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.petAtendido.upsert).not.toHaveBeenCalled();
    });
  });

  describe('removerPetAtendido', () => {
    it('tira o pet da lista sem tocar no pet nem nos registros', async () => {
      prisma.petAtendido.findUnique.mockResolvedValue({ id: 'v-1' });

      await service.removerPetAtendido('vet-1', 'pet-1');

      // Some o vínculo e só ele: o histórico clínico continua (api#117).
      expect(prisma.petAtendido.delete).toHaveBeenCalledWith({
        where: { id: 'v-1' },
      });
    });

    it('404 quando o pet não está na lista do veterinário', async () => {
      await expect(
        service.removerPetAtendido('vet-1', 'pet-alheio'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.petAtendido.delete).not.toHaveBeenCalled();
    });
  });
});
