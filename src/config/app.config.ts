import { registerAs } from '@nestjs/config';

/**
 * Origem pública da própria API — hoje só usada para montar a URL da foto de
 * clínica que a API serve (`GET /clinicas/fotos/:token`), em vez de embutir a
 * `GOOGLE_MAPS_API_KEY` na resposta. Sem valor em produção o boot falha, pelo
 * mesmo motivo do `CORS_ORIGINS`: um default de desenvolvimento vazando para
 * produção geraria link morto.
 */
function parseApiBaseUrl(raw: string | undefined, nodeEnv: string): string {
  if (raw && raw.trim().length > 0) {
    return raw.trim().replace(/\/+$/, '');
  }

  if (nodeEnv === 'production') {
    throw new Error(
      'API_BASE_URL is required in production. Set it to the public origin of this API (e.g. https://api.petcard.app).',
    );
  }

  return 'http://localhost:3000';
}

function parseCorsOrigins(raw: string | undefined, nodeEnv: string): string[] {
  if (raw && raw.trim().length > 0) {
    return raw
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
  }

  if (nodeEnv === 'production') {
    throw new Error(
      'CORS_ORIGINS is required in production. Set it to a comma-separated list of allowed origins.',
    );
  }

  return [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:8081',
    'http://localhost:19006',
  ];
}

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigins: parseCorsOrigins(
    process.env.CORS_ORIGINS,
    process.env.NODE_ENV ?? 'development',
  ),
  apiBaseUrl: parseApiBaseUrl(
    process.env.API_BASE_URL,
    process.env.NODE_ENV ?? 'development',
  ),
}));
