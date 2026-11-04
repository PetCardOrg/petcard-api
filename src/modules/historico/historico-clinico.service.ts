import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AcaoClinica,
  AnexoClinico,
  DewormingRecord,
  MedicationRecord,
  NotaClinica,
  Prisma,
  VaccineRecord,
} from '@prisma/client';
import {
  AcaoClinicaResponseDto,
  AcaoClinicaTipo,
  EntidadeClinica,
  HistoricoClinicoItemResponseDto,
  HistoricoClinicoQueryDto,
  HistoricoClinicoResponseDto,
  Role,
} from '@petcardorg/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ANEXOS_ATIVOS, toAnexoResponseDto } from '../anexo/anexo.mapper';
import { PetService } from '../pet/pet.service';

/**
 * Só o que o histórico exibe do veterinário. Antes o `include` trazia a linha
 * inteira — hash de senha incluído — para usar dois campos; o mapeamento
 * descartava o resto, mas carregar o hash sem necessidade é o mesmo passo que
 * já vazou senha de tutor em `tutor.service.ts`.
 */
type VetDaAssinatura = { id: string; nome: string; crmv: string };

type ComVet<T> = T & {
  veterinario: VetDaAssinatura | null;
  anexos?: AnexoClinico[];
};

const ASSINATURA_DO_VET = {
  veterinario: { select: { id: true, nome: true, crmv: true } },
  // Comprovantes ativos, também dos registros excluídos: o histórico mostra o
  // que foi comprovado, mesmo depois de o tutor tirar o registro da carteira.
  ...ANEXOS_ATIVOS,
} as const;

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
    query: HistoricoClinicoQueryDto = {},
  ): Promise<HistoricoClinicoResponseDto> {
    const pet = await this.petService.assertAccess(petId, userId, isVet);

    // Paginação opcional (AUD API-22). Cada tabela traz no máximo `limit + 1`
    // registros depois do cursor: o topo da página está entre eles, e o que
    // sobrar diz se há próxima. Sem `limit`, tudo, como antes.
    const cursor =
      query.cursor === undefined ? undefined : lerCursor(query.cursor);
    const pagina = {
      orderBy: ORDEM_DO_BANCO,
      ...(query.limit === undefined ? {} : { take: query.limit + 1 }),
    };
    const onde = (entidade: EntidadeClinica) => ({
      petId,
      ...depoisDoCursor(entidade, cursor),
    });

    const [notas, vacinas, vermifugos, medicacoes, acoes] = await Promise.all([
      // A nota traz a assinatura nas próprias colunas (ADR-009); os outros
      // três registros ainda dependem do vínculo com a conta.
      this.prisma.notaClinica.findMany({
        where: onde(EntidadeClinica.NOTA_CLINICA),
        ...pagina,
      }),
      this.prisma.vaccineRecord.findMany({
        where: onde(EntidadeClinica.VACINA),
        include: ASSINATURA_DO_VET,
        ...pagina,
      }),
      this.prisma.dewormingRecord.findMany({
        where: onde(EntidadeClinica.VERMIFUGO),
        include: ASSINATURA_DO_VET,
        ...pagina,
      }),
      this.prisma.medicationRecord.findMany({
        where: onde(EntidadeClinica.MEDICACAO),
        include: ASSINATURA_DO_VET,
        ...pagina,
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
    const todos: HistoricoClinicoItemResponseDto[] = [
      ...notas.map((n) => this.itemDaNota(n, porEntidade)),
      ...vacinas.map((v) => this.itemDaVacina(v, porEntidade)),
      ...vermifugos.map((d) => this.itemDoVermifugo(d, porEntidade)),
      ...medicacoes.map((m) => this.itemDaMedicacao(m, porEntidade)),
    ].sort(compararItens);

    if (query.limit === undefined || todos.length <= query.limit) {
      return { pet_id: pet.id, pet_nome: pet.name, itens: todos };
    }
    const itens = todos.slice(0, query.limit);
    return {
      pet_id: pet.id,
      pet_nome: pet.name,
      itens,
      proximo_cursor: escreverCursor(itens[itens.length - 1]),
    };
  }

  private itemDaNota(
    nota: NotaClinica,
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
      // `veterinario_id` ausente quando a conta do autor foi excluída — a
      // assinatura em si permanece.
      veterinario_id: nota.veterinarioId ?? undefined,
      veterinario_nome: nota.veterinarioNome,
      veterinario_crmv: nota.veterinarioCrmv,
      acoes: acoes.get(chave(EntidadeClinica.NOTA_CLINICA, nota.id)) ?? [],
      anexos: [],
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
      anexos: (vacina.anexos ?? []).map(toAnexoResponseDto),
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
      anexos: (verm.anexos ?? []).map(toAnexoResponseDto),
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
      anexos: (med.anexos ?? []).map(toAnexoResponseDto),
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
  private vet(veterinario: VetDaAssinatura | null, nomeLivre?: string | null) {
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

/**
 * Ordem da linha do tempo: o último registrado primeiro. O desempate existe
 * para a ordem ser total: sem ele, dois registros do mesmo instante podiam
 * trocar de lugar entre páginas e um deles sumir.
 *
 * Entre tabelas, desempata pelo tipo. Dentro de uma tabela, não compara o id
 * aqui: mantém a ordem que o banco devolveu (o `sort` é estável). O banco
 * compara texto pela collation (`en_US` ignora o hífen do UUID), e o cursor
 * usa a mesma comparação, então a ordem precisa ser a dele.
 */
function compararItens(
  a: HistoricoClinicoItemResponseDto,
  b: HistoricoClinicoItemResponseDto,
): number {
  return (
    b.registrado_em.getTime() - a.registrado_em.getTime() ||
    compararTipos(a.entidade, b.entidade)
  );
}

/** Os valores do enum são ASCII: a comparação simples é igual em todo lugar. */
function compararTipos(a: EntidadeClinica, b: EntidadeClinica): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A mesma ordem, dentro de uma tabela (o tipo é fixo). */
const ORDEM_DO_BANCO = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.NotaClinicaOrderByWithRelationInput[];

/** Posição do último item da página: onde a próxima começa. */
type Cursor = { t: Date; e: EntidadeClinica; id: string };

function escreverCursor(item: HistoricoClinicoItemResponseDto): string {
  const dados = {
    t: item.registrado_em.toISOString(),
    e: item.entidade,
    id: item.entidade_id,
  };
  return Buffer.from(JSON.stringify(dados)).toString('base64url');
}

function lerCursor(texto: string): Cursor {
  try {
    const dados = JSON.parse(
      Buffer.from(texto, 'base64url').toString('utf8'),
    ) as { t?: unknown; e?: unknown; id?: unknown };
    const t = new Date(String(dados.t));
    if (
      Number.isNaN(t.getTime()) ||
      !Object.values(EntidadeClinica).includes(dados.e as EntidadeClinica) ||
      typeof dados.id !== 'string'
    ) {
      throw new Error('cursor malformado');
    }
    return { t, e: dados.e as EntidadeClinica, id: dados.id };
  } catch {
    throw new BadRequestException('Cursor de paginação inválido.');
  }
}

/**
 * Filtro de uma tabela para "depois do cursor" na ordem de `compararItens`:
 * registrado antes, ou no mesmo instante e depois no desempate.
 */
function depoisDoCursor(
  entidade: EntidadeClinica,
  cursor: Cursor | undefined,
): { OR?: Array<Record<string, unknown>> } {
  if (!cursor) return {};
  const mesmoInstante = compararTipos(entidade, cursor.e);
  return {
    OR: [
      { createdAt: { lt: cursor.t } },
      ...(mesmoInstante > 0 ? [{ createdAt: cursor.t }] : []),
      ...(mesmoInstante === 0
        ? [{ createdAt: cursor.t, id: { lt: cursor.id } }]
        : []),
    ],
  };
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
