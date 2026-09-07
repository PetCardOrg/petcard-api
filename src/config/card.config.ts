import { registerAs } from '@nestjs/config';

export const cardConfig = registerAs('card', () => ({
  publicBaseUrl:
    process.env.PUBLIC_CARD_BASE_URL ?? 'https://card.petcard.app/#/card',
  // Página de quem encontra o pet. Base própria: a coleira aponta para um
  // fluxo diferente do da carteira, com token e conteúdo distintos.
  collarBaseUrl:
    process.env.PUBLIC_COLLAR_BASE_URL ?? 'https://card.petcard.app/#/achei',
  publicThrottleTtlSeconds: Number(
    process.env.PUBLIC_CARD_THROTTLE_TTL_SECONDS ?? 60,
  ),
  publicThrottleLimit: Number(process.env.PUBLIC_CARD_THROTTLE_LIMIT ?? 10),
}));
