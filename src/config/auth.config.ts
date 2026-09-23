import { registerAs } from '@nestjs/config';

/** Piso de entropia para um segredo de assinatura em produção. */
const MIN_SECRET_LENGTH = 32;

/**
 * O segredo do JWT assina todo token de sessão e o `state` do OAuth do
 * Calendar. Quem o adivinha emite token de qualquer usuário.
 *
 * Ausente, o boot seguia e só quebrava na primeira assinatura; curto, era
 * aceito sem reclamação. Mesma escolha do CORS: falhar no boot é melhor que
 * subir com a proteção capenga.
 */
function parseJwtSecret(
  raw: string | undefined,
  nodeEnv: string,
): string | undefined {
  if (!raw) {
    if (nodeEnv === 'production') {
      throw new Error(
        'JWT_SECRET is required in production. Generate one with: openssl rand -hex 32',
      );
    }
    return undefined;
  }

  if (nodeEnv === 'production' && raw.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters in production. Generate one with: openssl rand -hex 32`,
    );
  }

  return raw;
}

export const authConfig = registerAs('auth', () => ({
  jwtSecret: parseJwtSecret(
    process.env.JWT_SECRET,
    process.env.NODE_ENV ?? 'development',
  ),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
}));
