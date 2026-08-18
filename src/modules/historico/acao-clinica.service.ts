import { Injectable, Logger } from '@nestjs/common';
import { AcaoClinicaTipo, EntidadeClinica, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Cliente do Prisma dentro ou fora de transação. */
export type PrismaLike = Prisma.TransactionClient | PrismaService;

export interface RegistrarAcaoInput {
  petId: string;
  tipo: AcaoClinicaTipo;
  entidade: EntidadeClinica;
  entidadeId: string;
  autorId: string;
  autorTipo: Role;
  /** Snapshot do que mudou. Opcional para CRIACAO. */
  detalhes?: Prisma.InputJsonValue;
}

/**
 * Registra a trilha de auditoria das ações clínicas (api#117).
 *
 * A gravação acontece na mesma transação da ação que a originou: um registro
 * clínico sem entrada na trilha seria exatamente o buraco que esta issue
 * fecha, então não pode existir estado onde um foi gravado e o outro não.
 */
@Injectable()
export class AcaoClinicaService {
  private readonly logger = new Logger(AcaoClinicaService.name);

  constructor(private readonly prisma: PrismaService) {}

  async registrar(
    input: RegistrarAcaoInput,
    tx: PrismaLike = this.prisma,
  ): Promise<void> {
    const { nome, crmv } = await this.identificarAutor(
      input.autorId,
      input.autorTipo,
      tx,
    );

    await tx.acaoClinica.create({
      data: {
        petId: input.petId,
        tipo: input.tipo,
        entidade: input.entidade,
        entidadeId: input.entidadeId,
        autorTipo: input.autorTipo,
        autorId: input.autorId,
        autorNome: nome,
        autorCrmv: crmv,
        detalhes: input.detalhes,
      },
    });
  }

  /**
   * Resolve nome e CRMV **no momento da ação**, para gravá-los na trilha.
   *
   * O valor é copiado de propósito em vez de referenciado: a trilha precisa
   * continuar legível depois que a conta do autor for excluída.
   */
  private async identificarAutor(
    autorId: string,
    autorTipo: Role,
    tx: PrismaLike,
  ): Promise<{ nome: string; crmv: string | null }> {
    if (autorTipo === Role.VET) {
      const vet = await tx.veterinario.findUnique({
        where: { id: autorId },
        select: { nome: true, crmv: true },
      });
      if (vet) return { nome: vet.nome, crmv: vet.crmv };
    } else {
      const tutor = await tx.tutor.findUnique({
        where: { id: autorId },
        select: { name: true },
      });
      if (tutor) return { nome: tutor.name, crmv: null };
    }

    // Não impedir a ação por causa da trilha: sem o nome, o id ainda
    // identifica quem agiu.
    this.logger.warn(
      `Autor ${autorTipo} ${autorId} não encontrado ao registrar ação clínica.`,
    );
    return { nome: autorId, crmv: null };
  }
}
