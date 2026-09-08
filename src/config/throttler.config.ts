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
export function inteiroPositivo(
  valor: string | undefined,
  padrao: number,
): number {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : padrao;
}

/**
 * Teto fixo das rotas que custam mais que uma tentativa de login.
 *
 * O reenvio de verificação queima cota de SMTP e reputação de remetente; a
 * verificação de CRMV com `force=true` é uma consulta cobrada por chamada. Nas
 * duas, o orçamento do login (dez por minuto) é generoso demais — e nas duas
 * repetir é exceção, não uso normal. Fica fora do ambiente de propósito: é um
 * piso de proteção, não um número a calibrar.
 */
export const LIMITE_DE_ROTA_CARA = 3;

/**
 * Rate limit das rotas sem sessão (login e cadastro).
 *
 * Elas eram as únicas superfícies públicas sem limite: dava para varrer senhas
 * contra `POST /auth/login` na velocidade que a rede permitisse. O limite é por
 * IP e por janela.
 */
/**
 * Limite das rotas de clínica cobradas por chamada no Google
 * (`/clinicas/places`, `/clinicas/autocomplete`, `/clinicas/geocode`).
 * Compartilhado pelas três: o autocomplete sozinho dispara a cada tecla
 * digitada, então o teto por IP precisa cobrir esse padrão de uso — bem mais
 * generoso que o de login, mas ainda um teto.
 */
const DEFAULT_PLACES_LIMIT = 30;

/**
 * Limite do proxy de foto de clínica (`/clinicas/fotos/:token`). Uma única
 * busca por perto pode devolver até 20 clínicas, cada uma com 1 foto — o teto
 * é maior que o das rotas de busca de propósito, para não travar a rolagem da
 * lista de resultados.
 */
const DEFAULT_CLINICA_PHOTO_LIMIT = 60;

export const throttlerConfig = registerAs('throttler', () => ({
  authTtlSeconds: inteiroPositivo(
    process.env.AUTH_THROTTLE_TTL_SECONDS,
    DEFAULT_TTL_SECONDS,
  ),
  authLimit: inteiroPositivo(process.env.AUTH_THROTTLE_LIMIT, DEFAULT_LIMIT),
  placesTtlSeconds: inteiroPositivo(
    process.env.PLACES_THROTTLE_TTL_SECONDS,
    DEFAULT_TTL_SECONDS,
  ),
  placesLimit: inteiroPositivo(
    process.env.PLACES_THROTTLE_LIMIT,
    DEFAULT_PLACES_LIMIT,
  ),
  clinicaPhotoTtlSeconds: inteiroPositivo(
    process.env.CLINICA_PHOTO_THROTTLE_TTL_SECONDS,
    DEFAULT_TTL_SECONDS,
  ),
  clinicaPhotoLimit: inteiroPositivo(
    process.env.CLINICA_PHOTO_THROTTLE_LIMIT,
    DEFAULT_CLINICA_PHOTO_LIMIT,
  ),
}));
