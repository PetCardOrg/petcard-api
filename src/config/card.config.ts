import { registerAs } from '@nestjs/config';
import { inteiroPositivo } from './throttler.config';

export const cardConfig = registerAs('card', () => ({
  publicBaseUrl:
    process.env.PUBLIC_CARD_BASE_URL ?? 'https://card.petcard.app/#/card',
  // Página de quem encontra o pet. Base própria: a coleira aponta para um
  // fluxo diferente do da carteira, com token e conteúdo distintos.
  collarBaseUrl:
    process.env.PUBLIC_COLLAR_BASE_URL ?? 'https://card.petcard.app/#/achei',
  // `Number(...)` cru deixava um valor mal preenchido virar NaN e desligar o
  // throttler em silêncio nas rotas públicas (`/cards/:token`,
  // `/coleira/:token` e `/coleira/:token/leitura`) — mesmo risco que o
  // `inteiroPositivo` de `throttler.config.ts` já existe para evitar.
  publicThrottleTtlSeconds: inteiroPositivo(
    process.env.PUBLIC_CARD_THROTTLE_TTL_SECONDS,
    60,
  ),
  publicThrottleLimit: inteiroPositivo(
    process.env.PUBLIC_CARD_THROTTLE_LIMIT,
    10,
  ),
}));
