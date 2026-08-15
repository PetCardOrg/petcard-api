import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CrmvValidationResult, CrmvValidator } from './crmv-validator';

/** Situações que consideramos habilitadas a exercer. */
const SITUACOES_REGULARES = ['ativo', 'regular'];

type InfosimplesResponse = {
  code?: number;
  code_message?: string;
  data?: Array<{
    nome?: string;
    crmv?: string;
    situacao?: string;
    uf?: string;
  }>;
};

/**
 * Consulta o cadastro do CFMV pela API da Infosimples, que automatiza a
 * consulta pública oficial.
 *
 * É um serviço **pago por consulta**, então quem chama precisa cachear o
 * resultado — ver `CrmvVerificationService`, que persiste a verificação.
 */
@Injectable()
export class InfosimplesCrmvValidator implements CrmvValidator {
  private readonly logger = new Logger(InfosimplesCrmvValidator.name);
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.token = this.configService.get<string>('crmv.infosimplesToken') ?? '';
    this.baseUrl =
      this.configService.get<string>('crmv.infosimplesUrl') ??
      'https://api.infosimples.com/api/v2/consultas/cfmv/cadastro';
    this.timeoutMs = this.configService.get<number>('crmv.timeoutMs') ?? 15000;
  }

  async validate(crmv: string, uf: string): Promise<CrmvValidationResult> {
    if (!this.token) {
      throw new HttpException(
        'Validação de CRMV não configurada: falta INFOSIMPLES_TOKEN.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const url = new URL(this.baseUrl);
    url.searchParams.set('token', this.token);
    url.searchParams.set('query', crmv);
    url.searchParams.set('uf', uf);
    url.searchParams.set('timeout', String(Math.floor(this.timeoutMs / 1000)));

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      this.logger.error(
        `Falha ao consultar o CRMV ${crmv}/${uf}`,
        error instanceof Error ? error.stack : error,
      );
      throw new HttpException(
        'Não foi possível consultar a base de CRMV agora. Tente novamente.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const body = (await response.json()) as InfosimplesResponse;

    // A Infosimples devolve 200 com `code` próprio; 600 = sucesso.
    // 6xx diferente de 600 é erro de consulta; 7xx/8xx são erros da conta
    // (token inválido, sem crédito) — que não são culpa do veterinário.
    if (body.code !== 600) {
      this.logger.warn(
        `Consulta de CRMV ${crmv}/${uf} devolveu code=${body.code}: ${body.code_message ?? 'sem mensagem'}`,
      );
      if (body.code && body.code >= 700) {
        throw new HttpException(
          'Serviço de validação de CRMV indisponível no momento.',
          HttpStatus.BAD_GATEWAY,
        );
      }
      return { valid: false };
    }

    const registro = body.data?.[0];
    if (!registro) {
      return { valid: false };
    }

    const situacao = registro.situacao?.trim();
    const regular = SITUACOES_REGULARES.some((s) =>
      (situacao ?? '').toLowerCase().includes(s),
    );

    return { valid: regular, situacao, nome: registro.nome };
  }
}
