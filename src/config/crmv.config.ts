import { Logger } from '@nestjs/common';
import { registerAs } from '@nestjs/config';

/** Dias que uma verificação de CRMV vale antes de precisar ser refeita. */
const DEFAULT_TTL_DAYS = 180;

const PROVEDORES = ['infosimples', 'stub'] as const;
type ProvedorCrmv = (typeof PROVEDORES)[number];

/**
 * `stub` não faz chamada externa — padrão fora de produção, para o CI e a demo
 * não dependerem de rede nem de crédito.
 *
 * Em produção o provedor é obrigatório (AUD API-07): o stub aceita qualquer
 * CRMV bem formado, e um esquecimento no painel do deploy desligava a
 * verificação sem ninguém perceber. Stub em produção só se pedido por extenso.
 */
function resolverProvedor(
  raw: string | undefined,
  nodeEnv: string | undefined,
): ProvedorCrmv {
  const valor = raw?.trim();

  if (nodeEnv !== 'production') {
    return valor === 'infosimples' ? 'infosimples' : 'stub';
  }

  if (!valor) {
    throw new Error(
      'CRMV_PROVIDER is required in production. Set it to "infosimples" (or "stub" to knowingly accept any CRMV).',
    );
  }
  if (!PROVEDORES.includes(valor as ProvedorCrmv)) {
    throw new Error(
      `CRMV_PROVIDER "${valor}" is not valid. Use one of: ${PROVEDORES.join(', ')}.`,
    );
  }
  if (valor === 'stub') {
    new Logger('CrmvConfig').warn(
      'CRMV_PROVIDER=stub em produção: QUALQUER CRMV bem formado será aceito, sem consulta ao conselho.',
    );
  }
  return valor as ProvedorCrmv;
}

export const crmvConfig = registerAs('crmv', () => ({
  provider: resolverProvedor(process.env.CRMV_PROVIDER, process.env.NODE_ENV),
  infosimplesToken: process.env.INFOSIMPLES_TOKEN,
  infosimplesUrl: process.env.INFOSIMPLES_CFMV_URL,
  /** Filtro opcional de tipo de inscrição na consulta do CFMV. */
  tipoInscricao: process.env.INFOSIMPLES_TIPO_INSCRICAO,
  timeoutMs: Number(process.env.CRMV_TIMEOUT_MS ?? 15000),
  /** Consulta é paga: revalidar só depois deste prazo. */
  ttlDays: Number(process.env.CRMV_TTL_DAYS ?? DEFAULT_TTL_DAYS),
}));
