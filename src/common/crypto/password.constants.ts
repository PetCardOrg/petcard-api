/**
 * Parâmetros de senha, num lugar só.
 *
 * O custo do bcrypt estava em 10 e repetido em dois serviços — subir um e
 * esquecer o outro deixaria metade das contas com hash mais fraco. 12 é o
 * piso recomendado hoje para bcrypt; o custo é exponencial, então cada
 * incremento dobra o trabalho de quem tenta quebrar offline.
 */
export const BCRYPT_ROUNDS = 12;
