/**
 * Parâmetros de senha, num lugar só.
 *
 * O custo do bcrypt estava em 10 e repetido em dois serviços — subir um e
 * esquecer o outro deixaria metade das contas com hash mais fraco. 12 é o
 * piso recomendado hoje para bcrypt; o custo é exponencial, então cada
 * incremento dobra o trabalho de quem tenta quebrar offline.
 */
export const BCRYPT_ROUNDS = 12;

/** Mínimo aceito no cadastro. */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Teto de 72 bytes: o bcrypt ignora silenciosamente o que passa disso, então
 * uma senha maior daria ao usuário uma falsa sensação de força. Recusar é
 * melhor que truncar sem avisar — e barra corpo grande virando trabalho de
 * hash caro (o cadastro e o login são rotas sem sessão).
 */
export const PASSWORD_MAX_LENGTH = 72;
