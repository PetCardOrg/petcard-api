import { registerAs } from '@nestjs/config';

/** Dias que uma verificação de CRMV vale antes de precisar ser refeita. */
const DEFAULT_TTL_DAYS = 180;

export const crmvConfig = registerAs('crmv', () => ({
  /**
   * Provedor da consulta. `stub` não faz chamada externa — padrão fora de
   * produção, para o CI e a demo não dependerem de rede nem de crédito.
   */
  provider: process.env.CRMV_PROVIDER ?? 'stub',
  infosimplesToken: process.env.INFOSIMPLES_TOKEN,
  infosimplesUrl: process.env.INFOSIMPLES_CFMV_URL,
  timeoutMs: Number(process.env.CRMV_TIMEOUT_MS ?? 15000),
  /** Consulta é paga: revalidar só depois deste prazo. */
  ttlDays: Number(process.env.CRMV_TTL_DAYS ?? DEFAULT_TTL_DAYS),
}));
