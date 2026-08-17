import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CrmvValidationResult, CrmvValidator } from './crmv-validator';

/** Situações que consideramos habilitadas a exercer. */
const SITUACOES_REGULARES = ['ativo', 'regular'];

/** `code` de sucesso da API. Qualquer outro valor não libera a verificação. */
const CODE_SUCESSO = 200;

/** A partir daqui o erro é da conta/serviço, não do CRMV consultado. */
const CODE_ERRO_SERVICO = 700;

/** Pessoa física — o veterinário é o profissional, não a clínica. */
const TIPO_INSCRICAO_PESSOA_FISICA = '0';

type RegistroCfmv = {
  nome?: string;
  crmv?: string;
  situacao?: string;
  uf?: string;
  inscricao?: string;
  data_inscricao?: string;
};

type InfosimplesResponse = {
  code?: number;
  code_message?: string;
  errors?: unknown[];
  data_count?: number;
  /** Cada item agrupa os `resultados` de uma consulta e o recibo do site. */
  data?: Array<{ resultados?: RegistroCfmv[] }>;
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
  private readonly tipoInscricao?: string;

  constructor(private readonly configService: ConfigService) {
    this.token = this.configService.get<string>('crmv.infosimplesToken') ?? '';
    this.baseUrl =
      this.configService.get<string>('crmv.infosimplesUrl') ??
      'https://api.infosimples.com/api/v2/consultas/cfmv/cadastro';
    this.timeoutMs = this.configService.get<number>('crmv.timeoutMs') ?? 15000;
    this.tipoInscricao = this.configService.get<string>('crmv.tipoInscricao');
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
    // Veterinário é pessoa física; a clínica (jurídica) seria tipo 1.
    url.searchParams.set(
      'tipo_inscricao',
      this.tipoInscricao ?? TIPO_INSCRICAO_PESSOA_FISICA,
    );
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

    // O HTTP é sempre 200; o resultado vem no `code` do corpo. A partir de 700
    // o problema é da conta (token inválido, sem crédito) — não é culpa do
    // veterinário, então vira indisponibilidade em vez de recusa.
    if (body.code !== CODE_SUCESSO) {
      this.logger.warn(
        `Consulta de CRMV ${crmv}/${uf} devolveu code=${body.code}: ${body.code_message ?? 'sem mensagem'}`,
      );
      if (body.code && body.code >= CODE_ERRO_SERVICO) {
        throw new HttpException(
          'Serviço de validação de CRMV indisponível no momento.',
          HttpStatus.BAD_GATEWAY,
        );
      }
      return { valid: false };
    }

    // `data` agrupa consultas; os registros ficam em `resultados`.
    const registro = body.data?.[0]?.resultados?.[0];
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
