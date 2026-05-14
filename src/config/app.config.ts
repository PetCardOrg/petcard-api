import { registerAs } from '@nestjs/config';

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
}));
