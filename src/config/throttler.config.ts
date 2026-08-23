import { registerAs } from '@nestjs/config';

const DEFAULT_TTL_SECONDS = 60;
const DEFAULT_LIMIT = 10;

/**
 * Lê um inteiro positivo do ambiente, caindo no padrão quando o valor não
 * serve.
 *
 * `Number('dez')` é `NaN`, e `NaN` como limite faz o throttler parar de
 * limitar — a variável mal preenchida desligaria em silêncio justamente a
 * proteção de força bruta que ela deveria calibrar.
 */
function inteiroPositivo(valor: string | undefined, padrao: number): number {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : padrao;
}

/**
 * Rate limit das rotas sem sessão (login e cadastro).
 *
 * Elas eram as únicas superfícies públicas sem limite: dava para varrer senhas
 * contra `POST /auth/login` na velocidade que a rede permitisse. O limite é por
 * IP e por janela.
 */
export const throttlerConfig = registerAs('throttler', () => ({
  authTtlSeconds: inteiroPositivo(
    process.env.AUTH_THROTTLE_TTL_SECONDS,
    DEFAULT_TTL_SECONDS,
  ),
  authLimit: inteiroPositivo(process.env.AUTH_THROTTLE_LIMIT, DEFAULT_LIMIT),
}));
