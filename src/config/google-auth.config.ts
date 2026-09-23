import { registerAs } from '@nestjs/config';

/**
 * Login social do tutor via Google (mobile#54).
 *
 * O app manda o ID token do Google; a API valida a assinatura e confere se o
 * `aud` bate com um dos client IDs configurados. Cada plataforma do Expo
 * (web/iOS/Android) tem o seu, então a variável é uma lista separada por
 * vírgula.
 *
 * Distinto do `googleCalendar.*`, que é o fluxo OAuth de acesso à agenda — aqui
 * não há troca de code nem refresh token, só verificação de identidade.
 */
export const googleAuthConfig = registerAs('googleAuth', () => ({
  clientIds: (process.env.GOOGLE_AUTH_CLIENT_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0),
}));
