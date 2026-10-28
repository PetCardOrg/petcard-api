import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Quantos proxies reversos ficam entre o cliente e a API. Em produção é o
 * proxy do Render.
 *
 * Um número, e não `true`: com `true` o Express aceita o primeiro IP do
 * `X-Forwarded-For`, que o próprio cliente escreve, e qualquer um ganharia um
 * balde novo do rate limit a cada requisição.
 */
const PROXIES_CONFIAVEIS = 1;

/**
 * Faz o `req.ip` ser o IP do usuário, e não o do proxy. Sem isso o throttler
 * coloca todos os usuários no mesmo balde e o limite de login, somando todo
 * mundo, estoura em minutos (AUD API-01).
 */
export function confiarNoProxyReverso(app: NestExpressApplication): void {
  app.set('trust proxy', PROXIES_CONFIAVEIS);
}
