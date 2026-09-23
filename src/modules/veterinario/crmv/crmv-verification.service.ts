import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { CRMV_VALIDATOR, type CrmvValidator } from './crmv-validator';

const MS_PER_DAY = 86_400_000;

/** Aceita "SP 12345", "CRMV-SP 12345", "12345/SP". */
const CRMV_PATTERN =
  /^(?:CRMV[-\s]?)?([A-Z]{2})[-\s/]?(\d{3,6})$|^(\d{3,6})[-\s/]([A-Z]{2})$/i;

export type CrmvVerificationStatus = {
  verified: boolean;
  situacao?: string;
  verified_at?: Date;
};

@Injectable()
export class CrmvVerificationService {
  private readonly logger = new Logger(CrmvVerificationService.name);

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
      select: { crmv: true, crmvVerifiedAt: true, crmvSituacao: true },
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
    const resultado = await this.validator.validate(numero, uf);

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
}
