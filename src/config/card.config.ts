import { registerAs } from '@nestjs/config';

export const cardConfig = registerAs('card', () => ({
  publicBaseUrl:
    process.env.PUBLIC_CARD_BASE_URL ?? 'https://card.petcard.app/#/card',
  publicThrottleTtlSeconds: Number(
    process.env.PUBLIC_CARD_THROTTLE_TTL_SECONDS ?? 60,
  ),
  publicThrottleLimit: Number(process.env.PUBLIC_CARD_THROTTLE_LIMIT ?? 10),
}));
