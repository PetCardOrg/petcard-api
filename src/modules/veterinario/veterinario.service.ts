import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Veterinario } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateVeterinarioDto, UpdateVeterinarioDto } from '@petcardorg/shared';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require('bcrypt') as {
  hash(data: string, rounds: number): Promise<string>;
};
const BCRYPT_ROUNDS = 10;

export type VeterinarioResponse = Omit<Veterinario, 'password'>;

export interface DashboardPetItem {
  id: string;
  name: string;
  species: string;
  breed?: string;
  photo_url?: string;
  tutor_name: string;
  last_attended_at: Date;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function toResponse(vet: Veterinario): VeterinarioResponse {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, ...rest } = vet;
  return rest;
}

@Injectable()
export class VeterinarioService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateVeterinarioDto): Promise<VeterinarioResponse> {
    await this.assertUniqueFields(dto.email, dto.crmv);

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const vet = await this.prisma.veterinario.create({
      data: {
        nome: dto.nome,
        email: dto.email,
        password: hashedPassword,
        crmv: dto.crmv,
        telefone: dto.telefone,
      },
    });

    return toResponse(vet);
  }

  async findAll(): Promise<VeterinarioResponse[]> {
    const vets = await this.prisma.veterinario.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return vets.map(toResponse);
  }

  async findById(id: string): Promise<VeterinarioResponse> {
    const vet = await this.prisma.veterinario.findUnique({ where: { id } });
    if (!vet) {
      throw new NotFoundException(`Veterinario with id ${id} not found`);
    }
    return toResponse(vet);
  }

  async update(
    id: string,
    dto: UpdateVeterinarioDto,
  ): Promise<VeterinarioResponse> {
    await this.findById(id);

    if (dto.email || dto.crmv) {
      await this.assertUniqueFields(dto.email, dto.crmv, id);
    }

    const data: Record<string, unknown> = {};
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.crmv !== undefined) data.crmv = dto.crmv;
    if (dto.telefone !== undefined) data.telefone = dto.telefone;
    if (dto.password !== undefined) {
      data.password = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    }

    const vet = await this.prisma.veterinario.update({
      where: { id },
      data,
    });

    return toResponse(vet);
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.veterinario.delete({ where: { id } });
  }

  async findAttendedPets(
    veterinarioId: string,
    query: DashboardQueryDto,
  ): Promise<PaginatedResponse<DashboardPetItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const search = query.search?.trim();

    const where: Prisma.NotaClinicaWhereInput = { veterinarioId };

    if (search) {
      where.OR = [
        {
          pet: { name: { contains: search, mode: 'insensitive' } },
        },
        {
          pet: {
            tutor: {
              name: { contains: search, mode: 'insensitive' },
            },
          },
        },
      ];
    }

    const distinctPetIds = await this.prisma.notaClinica.findMany({
      where,
      distinct: ['petId'],
      orderBy: { createdAt: 'desc' },
      select: { petId: true, createdAt: true },
    });

    const total = distinctPetIds.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const skip = (page - 1) * pageSize;

    const paginatedPetIds = distinctPetIds.slice(skip, skip + pageSize);

    if (paginatedPetIds.length === 0) {
      return { items: [], total, page, pageSize, totalPages };
    }

    const lastAttendedMap = new Map(
      paginatedPetIds.map((n) => [n.petId, n.createdAt]),
    );

    const pets = await this.prisma.pet.findMany({
      where: { id: { in: paginatedPetIds.map((n) => n.petId) } },
      include: { tutor: { select: { name: true } } },
    });

    const items: DashboardPetItem[] = [];
    for (const n of paginatedPetIds) {
      const pet = pets.find((p) => p.id === n.petId);
      if (!pet) continue;
      items.push({
        id: pet.id,
        name: pet.name,
        species: pet.species,
        breed: pet.breed ?? undefined,
        photo_url: pet.photoUrl ?? undefined,
        tutor_name: pet.tutor.name,
        last_attended_at: lastAttendedMap.get(pet.id)!,
      });
    }

    return { items, total, page, pageSize, totalPages };
  }

  private async assertUniqueFields(
    email?: string,
    crmv?: string,
    excludeId?: string,
  ): Promise<void> {
    if (email) {
      const existing = await this.prisma.veterinario.findUnique({
        where: { email },
      });
      if (existing && existing.id !== excludeId) {
        throw new ConflictException('Email already registered');
      }
    }

    if (crmv) {
      const existing = await this.prisma.veterinario.findUnique({
        where: { crmv },
      });
      if (existing && existing.id !== excludeId) {
        throw new ConflictException('CRMV already registered');
      }
    }
  }
}
