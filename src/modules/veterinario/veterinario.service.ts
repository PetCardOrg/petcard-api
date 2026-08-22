import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Veterinario } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PetAtendidoResponseDto,
  UpdateVeterinarioDto,
} from '@petcardorg/shared';
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

  /**
   * Atualiza o cadastro do veterinário.
   *
   * Trocar o CRMV derruba a verificação junto: manter o carimbo antigo
   * deixaria o registro novo — que ninguém conferiu — acessando dado clínico
   * com a credencial que o registro anterior conquistou (api#113).
   */
  async update(
    id: string,
    dto: UpdateVeterinarioDto,
  ): Promise<VeterinarioResponse> {
    const atual = await this.findById(id);

    if (dto.email || dto.crmv) {
      await this.assertUniqueFields(dto.email, dto.crmv, id);
    }

    const data: Record<string, unknown> = {};
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.crmv !== undefined && dto.crmv !== atual.crmv) {
      data.crmv = dto.crmv;
      data.crmvVerifiedAt = null;
      data.crmvSituacao = null;
    }
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

  /**
   * Lista os pets vinculados a este veterinário.
   *
   * A lista era derivada dos registros clínicos vivos, então o veterinário
   * que apagasse o próprio registro via o pet sumir do dashboard. Agora o
   * vínculo é um fato guardado: entra pelo QR, sai só por remoção explícita.
   */
  async findAttendedPets(
    veterinarioId: string,
    query: DashboardQueryDto,
  ): Promise<PaginatedResponse<DashboardPetItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const search = query.search?.trim();

    const where: Prisma.PetAtendidoWhereInput = {
      veterinarioId,
      ...(search
        ? {
            pet: {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { tutor: { name: { contains: search, mode: 'insensitive' } } },
              ],
            },
          }
        : {}),
    };

    const [total, vinculos] = await Promise.all([
      this.prisma.petAtendido.count({ where }),
      this.prisma.petAtendido.findMany({
        where,
        orderBy: { ultimoAcessoEm: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { pet: { include: { tutor: { select: { name: true } } } } },
      }),
    ]);

    const items: DashboardPetItem[] = vinculos.map(
      ({ pet, ultimoAcessoEm }) => ({
        id: pet.id,
        name: pet.name,
        species: pet.species,
        breed: pet.breed ?? undefined,
        photo_url: pet.photoUrl ?? undefined,
        tutor_name: pet.tutor.name,
        last_attended_at: ultimoAcessoEm,
      }),
    );

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  /**
   * Vincula ao veterinário o pet cuja carteira foi aberta pelo QR.
   *
   * Ter o token é a autorização de fato: quem o leu esteve com o pet na
   * frente. Reabrir a carteira de um pet que já está na lista não duplica
   * nada — só atualiza o último atendimento, que ordena o dashboard.
   */
  async adicionarPetPorToken(
    veterinarioId: string,
    token: string,
  ): Promise<PetAtendidoResponseDto> {
    const carteira = await this.prisma.carteiraDigital.findUnique({
      where: { token },
      include: { pet: { select: { id: true, name: true } } },
    });
    if (!carteira) {
      throw new NotFoundException('Carteira não encontrada');
    }

    const existente = await this.prisma.petAtendido.findUnique({
      where: { veterinarioId_petId: { veterinarioId, petId: carteira.petId } },
    });

    const vinculo = await this.prisma.petAtendido.upsert({
      where: { veterinarioId_petId: { veterinarioId, petId: carteira.petId } },
      create: { veterinarioId, petId: carteira.petId },
      update: { ultimoAcessoEm: new Date() },
    });

    return {
      pet_id: carteira.pet.id,
      pet_nome: carteira.pet.name,
      adicionado_em: vinculo.createdAt,
      novo: existente === null,
    };
  }

  /**
   * Tira o pet da lista do veterinário.
   *
   * Some o vínculo, não o pet nem o que foi registrado nele: o histórico
   * clínico e a trilha de ações continuam intactos (api#117).
   */
  async removerPetAtendido(
    veterinarioId: string,
    petId: string,
  ): Promise<void> {
    const vinculo = await this.prisma.petAtendido.findUnique({
      where: { veterinarioId_petId: { veterinarioId, petId } },
    });
    if (!vinculo) {
      throw new NotFoundException('Pet não está na lista deste veterinário');
    }
    await this.prisma.petAtendido.delete({ where: { id: vinculo.id } });
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
