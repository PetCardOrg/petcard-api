import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CRMV_VALIDATOR,
  type CrmvValidationResult,
  type CrmvValidator,
} from './crmv-validator';
import { nomesConferem } from './nomes-conferem';

const MS_PER_DAY = 86_400_000;

/**
 * Situação gravada (e mostrada ao vet) quando o registro é regular mas está em
 * nome de outra pessoa. Legível de propósito: a web exibe a situação como veio.
 */
export const SITUACAO_NOME_DIVERGENTE =
  'Nome do cadastro não confere com o titular do CRMV';

/** Aceita "SP 12345", "CRMV-SP 12345", "12345/SP". */
const CRMV_PATTERN =
  /^(?:CRMV[-\s]?)?([A-Z]{2})[-\s/]?(\d{3,6})$|^(\d{3,6})[-\s/]([A-Z]{2})$/i;

/**
 * Quanto a consulta do cadastro fica guardada em memória. Cobre o intervalo
 * entre o vet informar o CRMV no formulário e concluir o cadastro, para a
 * verificação do cadastro reaproveitar a consulta em vez de pagar outra.
 */
const CONSULTA_TTL_MS = 30 * 60 * 1000;
const CONSULTA_MAX_ENTRADAS = 500;

export type CrmvVerificationStatus = {
  verified: boolean;
  situacao?: string;
  verified_at?: Date;
};

/** Resposta de `GET /auth/veterinario/crmv` (cadastro com CRMV primeiro). */
export type CrmvConsulta = {
  /** CRMV no formato canônico ("CRMV-SP 12345"), para o cadastro gravar. */
  crmv: string;
  uf: string;
  numero: string;
  /** Registro encontrado e em situação regular. */
  valido: boolean;
  /** Nome no cadastro do CFMV, para pré-preencher o formulário (editável). */
  nome?: string;
  situacao?: string;
};

@Injectable()
export class CrmvVerificationService {
  private readonly logger = new Logger(CrmvVerificationService.name);
  private readonly consultas = new Map<
    string,
    { resultado: CrmvValidationResult; expiraEm: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(CRMV_VALIDATOR) private readonly validator: CrmvValidator,
  ) {}

  private get ttlMs(): number {
    return (this.configService.get<number>('crmv.ttlDays') ?? 180) * MS_PER_DAY;
  }

  /** Uma verificação vence: registro pode ser suspenso depois de concedido. */
  isStillValid(verifiedAt: Date | null): boolean {
    if (!verifiedAt) return false;
    return Date.now() - verifiedAt.getTime() < this.ttlMs;
  }

  /** Separa "CRMV-SP 12345" em número e UF para a consulta. */
  parseCrmv(crmv: string): { numero: string; uf: string } {
    const match = CRMV_PATTERN.exec(crmv.trim());
    if (!match) {
      throw new BadRequestException(
        `CRMV "${crmv}" não está num formato reconhecido. Use, por exemplo, "CRMV-SP 12345".`,
      );
    }
    // O primeiro par cobre "SP 12345"; o segundo, "12345/SP".
    const uf = (match[1] ?? match[4]).toUpperCase();
    const numero = match[2] ?? match[3];
    return { numero, uf };
  }

  async getStatus(veterinarioId: string): Promise<CrmvVerificationStatus> {
    const vet = await this.prisma.veterinario.findUnique({
      where: { id: veterinarioId },
      select: { crmvVerifiedAt: true, crmvSituacao: true },
    });
    if (!vet) throw new NotFoundException('Veterinário não encontrado');

    return {
      verified: this.isStillValid(vet.crmvVerifiedAt),
      situacao: vet.crmvSituacao ?? undefined,
      verified_at: vet.crmvVerifiedAt ?? undefined,
    };
  }

  /**
   * Verifica o CRMV numa base externa e guarda o resultado.
   *
   * A consulta é paga por chamada: se já houver verificação dentro do prazo,
   * devolve a que está salva sem consultar de novo (`force` ignora o cache).
   */
  async verify(
    veterinarioId: string,
    force = false,
  ): Promise<CrmvVerificationStatus> {
    const vet = await this.prisma.veterinario.findUnique({
      where: { id: veterinarioId },
      select: {
        nome: true,
        crmv: true,
        crmvVerifiedAt: true,
        crmvSituacao: true,
      },
    });
    if (!vet) throw new NotFoundException('Veterinário não encontrado');

    if (!force && this.isStillValid(vet.crmvVerifiedAt)) {
      return {
        verified: true,
        situacao: vet.crmvSituacao ?? undefined,
        verified_at: vet.crmvVerifiedAt ?? undefined,
      };
    }

    const { numero, uf } = this.parseCrmv(vet.crmv);
    const consulta = force
      ? await this.validator.validate(numero, uf)
      : await this.consultar(numero, uf);
    const resultado = this.conferirTitular(consulta, vet.nome);

    const verifiedAt = resultado.valid ? new Date() : null;
    await this.prisma.veterinario.update({
      where: { id: veterinarioId },
      data: { crmvVerifiedAt: verifiedAt, crmvSituacao: resultado.situacao },
    });

    this.logger.log(
      `CRMV ${vet.crmv} verificado: ${resultado.valid ? 'regular' : 'recusado'} (${resultado.situacao ?? 'sem situação'})`,
    );

    return {
      verified: resultado.valid,
      situacao: resultado.situacao,
      verified_at: verifiedAt ?? undefined,
    };
  }

  /**
   * O CRMV é público: um registro regular só verifica a conta de quem é o
   * titular dele (AUD API-06). Sem nome na resposta (o stub não devolve),
   * não há o que comparar e vale a situação do registro.
   */
  private conferirTitular(
    consulta: CrmvValidationResult,
    nomeDoCadastro: string,
  ): CrmvValidationResult {
    if (
      !consulta.valid ||
      !consulta.nome ||
      nomesConferem(nomeDoCadastro, consulta.nome)
    ) {
      return consulta;
    }
    return { ...consulta, valid: false, situacao: SITUACAO_NOME_DIVERGENTE };
  }

  /** "CRMV-SP 12345" — o formato em que o cadastro passa a gravar. */
  formatCrmv(crmv: string): string {
    const { numero, uf } = this.parseCrmv(crmv);
    return `CRMV-${uf} ${numero}`;
  }

  /**
   * Consulta o CRMV antes do cadastro, para o formulário preencher o nome a
   * partir do registro oficial.
   *
   * CRMV já cadastrado responde 409 antes de consultar: além de avisar o vet
   * cedo, não paga uma consulta para um cadastro que não vai acontecer.
   */
  async lookup(crmv: string): Promise<CrmvConsulta> {
    const { numero, uf } = this.parseCrmv(crmv);
    const canonico = this.formatCrmv(crmv);

    const existente = await this.prisma.veterinario.findFirst({
      where: { crmv: { in: [crmv.trim(), canonico] } },
      select: { id: true },
    });
    if (existente) {
      throw new ConflictException('CRMV already registered');
    }

    const resultado = await this.consultar(numero, uf);
    return {
      crmv: canonico,
      uf,
      numero,
      valido: resultado.valid,
      nome: resultado.valid ? resultado.nome : undefined,
      situacao: resultado.situacao,
    };
  }

  /** Consulta paga, com cache curto em memória (ver `CONSULTA_TTL_MS`). */
  private async consultar(
    numero: string,
    uf: string,
  ): Promise<CrmvValidationResult> {
    const chave = `${uf}-${numero}`;
    const guardada = this.consultas.get(chave);
    if (guardada && guardada.expiraEm > Date.now()) {
      return guardada.resultado;
    }

    const resultado = await this.validator.validate(numero, uf);
    this.consultas.delete(chave);
    this.consultas.set(chave, {
      resultado,
      expiraEm: Date.now() + CONSULTA_TTL_MS,
    });
    // Map guarda ordem de inserção: o primeiro é o mais antigo.
    if (this.consultas.size > CONSULTA_MAX_ENTRADAS) {
      const [maisAntiga] = this.consultas.keys();
      if (maisAntiga) this.consultas.delete(maisAntiga);
    }
    return resultado;
  }
}
