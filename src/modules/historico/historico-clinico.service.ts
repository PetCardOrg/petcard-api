import { Injectable } from '@nestjs/common';
import {
  AcaoClinica,
  DewormingRecord,
  MedicationRecord,
  NotaClinica,
  VaccineRecord,
  Veterinario,
} from '@prisma/client';
import {
  AcaoClinicaResponseDto,
  AcaoClinicaTipo,
  EntidadeClinica,
  HistoricoClinicoItemResponseDto,
  HistoricoClinicoResponseDto,
  Role,
} from '@petcardorg/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PetService } from '../pet/pet.service';

type ComVet<T> = T & { veterinario: Veterinario | null };

@Injectable()
export class HistoricoClinicoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly petService: PetService,
  ) {}

  /**
   * Linha do tempo clínica do pet (api#117).
   *
   * Diferente das listagens normais, **inclui os registros excluídos**,
   * marcados por `excluido`. É o ponto da issue: o que o veterinário orientou
   * continua demonstrável mesmo quando o tutor apagou da própria visualização.
   */
  async doPet(
    petId: string,
    userId: string,
    isVet: boolean,
  ): Promise<HistoricoClinicoResponseDto> {
    const pet = await this.petService.assertAccess(petId, userId, isVet);

    const [notas, vacinas, vermifugos, medicacoes, acoes] = await Promise.all([
      this.prisma.notaClinica.findMany({
        where: { petId },
        include: { veterinario: true },
      }),
      this.prisma.vaccineRecord.findMany({
        where: { petId },
        include: { veterinario: true },
      }),
      this.prisma.dewormingRecord.findMany({
        where: { petId },
        include: { veterinario: true },
      }),
      this.prisma.medicationRecord.findMany({
        where: { petId },
        include: { veterinario: true },
      }),
      this.prisma.acaoClinica.findMany({
        where: { petId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const porEntidade = agruparAcoes(acoes);

    // Ordem de registro, não data clínica: o último lançamento é o topo da
    // pilha, seja ele nota, vacina, vermífugo ou medicação. Vacina aplicada
    // meses atrás e registrada agora entra no topo — foi o que aconteceu.
    const itens: HistoricoClinicoItemResponseDto[] = [
      ...notas.map((n) => this.itemDaNota(n, porEntidade)),
      ...vacinas.map((v) => this.itemDaVacina(v, porEntidade)),
      ...vermifugos.map((d) => this.itemDoVermifugo(d, porEntidade)),
      ...medicacoes.map((m) => this.itemDaMedicacao(m, porEntidade)),
    ].sort((a, b) => b.registrado_em.getTime() - a.registrado_em.getTime());

    return { pet_id: pet.id, pet_nome: pet.name, itens };
  }

  private itemDaNota(
    nota: ComVet<NotaClinica>,
    acoes: Map<string, AcaoClinicaResponseDto[]>,
  ): HistoricoClinicoItemResponseDto {
    return {
      entidade: EntidadeClinica.NOTA_CLINICA,
      entidade_id: nota.id,
      titulo: nota.diagnostico,
      descricao: nota.prescricao ?? nota.observacoes ?? undefined,
      // A consulta não tem data própria: o fato clínico é o instante em que
      // o veterinário escreveu, e instante o cliente sabe localizar.
      ocorrido_em: nota.createdAt.toISOString(),
      registrado_em: nota.createdAt,
      ...this.exclusao(nota.deletedAt),
      ...this.vet(nota.veterinario),
      acoes: acoes.get(chave(EntidadeClinica.NOTA_CLINICA, nota.id)) ?? [],
    };
  }

  private itemDaVacina(
    vacina: ComVet<VaccineRecord>,
    acoes: Map<string, AcaoClinicaResponseDto[]>,
  ): HistoricoClinicoItemResponseDto {
    return {
      entidade: EntidadeClinica.VACINA,
      entidade_id: vacina.id,
      titulo: vacina.vaccineName,
      descricao: vacina.notes ?? undefined,
      ocorrido_em: diaDeCalendario(vacina.appliedAt),
      registrado_em: vacina.createdAt,
      ...this.exclusao(vacina.deletedAt),
      ...this.vet(vacina.veterinario, vacina.veterinarianName),
      acoes: acoes.get(chave(EntidadeClinica.VACINA, vacina.id)) ?? [],
    };
  }

  private itemDoVermifugo(
    verm: ComVet<DewormingRecord>,
    acoes: Map<string, AcaoClinicaResponseDto[]>,
  ): HistoricoClinicoItemResponseDto {
    return {
      entidade: EntidadeClinica.VERMIFUGO,
      entidade_id: verm.id,
      titulo: verm.productName,
      descricao: verm.notes ?? undefined,
      ocorrido_em: diaDeCalendario(verm.appliedAt),
      registrado_em: verm.createdAt,
      ...this.exclusao(verm.deletedAt),
      ...this.vet(verm.veterinario, verm.veterinarianName),
      acoes: acoes.get(chave(EntidadeClinica.VERMIFUGO, verm.id)) ?? [],
    };
  }

  private itemDaMedicacao(
    med: ComVet<MedicationRecord>,
    acoes: Map<string, AcaoClinicaResponseDto[]>,
  ): HistoricoClinicoItemResponseDto {
    return {
      entidade: EntidadeClinica.MEDICACAO,
      entidade_id: med.id,
      titulo: med.medicationName,
      descricao: `${med.dosage} · ${med.frequency}`,
      ocorrido_em: diaDeCalendario(med.startDate),
      registrado_em: med.createdAt,
      ...this.exclusao(med.deletedAt),
      ...this.vet(med.veterinario),
      acoes: acoes.get(chave(EntidadeClinica.MEDICACAO, med.id)) ?? [],
    };
  }

  private exclusao(deletedAt: Date | null) {
    return {
      excluido: deletedAt !== null,
      excluido_em: deletedAt ?? undefined,
    };
  }

  /**
   * O nome em texto livre cobre o profissional que não usa o PetCard; a FK,
   * quando existe, é a atribuição confiável e traz o CRMV junto.
   */
  private vet(veterinario: Veterinario | null, nomeLivre?: string | null) {
    if (veterinario) {
      return {
        veterinario_id: veterinario.id,
        veterinario_nome: veterinario.nome,
        veterinario_crmv: veterinario.crmv,
      };
    }
    return { veterinario_nome: nomeLivre ?? undefined };
  }
}

/**
 * `appliedAt`/`startDate` são dia de calendário guardados em coluna de
 * instante, à meia-noite UTC. Entregues como instante, o cliente em fuso
 * negativo renderiza o dia anterior — a vacina de hoje aparece como de ontem.
 * Mesma serialização das listagens de vacina, vermífugo e medicação.
 */
function diaDeCalendario(data: Date): string {
  return data.toISOString().split('T')[0];
}

function chave(entidade: EntidadeClinica, id: string): string {
  return `${entidade}:${id}`;
}

function agruparAcoes(
  acoes: AcaoClinica[],
): Map<string, AcaoClinicaResponseDto[]> {
  const mapa = new Map<string, AcaoClinicaResponseDto[]>();
  for (const acao of acoes) {
    const k = chave(acao.entidade as EntidadeClinica, acao.entidadeId);
    const lista = mapa.get(k) ?? [];
    lista.push({
      id: acao.id,
      tipo: acao.tipo as AcaoClinicaTipo,
      autor_tipo: acao.autorTipo as Role,
      autor_id: acao.autorId,
      autor_nome: acao.autorNome,
      autor_crmv: acao.autorCrmv ?? undefined,
      ocorrido_em: acao.createdAt,
    });
    mapa.set(k, lista);
  }
  return mapa;
}
