import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './password.constants';

/**
 * Regra de senha forte do cadastro e da redefinição (mobile#54): mínimo 8,
 * teto de 72 bytes (limite do bcrypt), e ao menos uma maiúscula, um dígito e
 * um caractere especial.
 *
 * São `@Matches` separados de propósito — cada um com a sua mensagem, para o
 * usuário saber exatamente qual regra faltou em vez de um "senha inválida"
 * genérico. O `login` continua sem regra de força: senha antiga curta ainda
 * entra; a exigência vale para quem define uma senha nova.
 */
export function IsStrongPassword(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    MinLength(PASSWORD_MIN_LENGTH, {
      message: `A senha deve ter no mínimo ${PASSWORD_MIN_LENGTH} caracteres.`,
    }),
    MaxLength(PASSWORD_MAX_LENGTH, {
      message: `A senha deve ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.`,
    }),
    Matches(/[A-Z]/, {
      message: 'A senha deve conter ao menos uma letra maiúscula.',
    }),
    Matches(/[0-9]/, {
      message: 'A senha deve conter ao menos um número.',
    }),
    Matches(/[^A-Za-z0-9]/, {
      message: 'A senha deve conter ao menos um caractere especial.',
    }),
  );
}

/**
 * Mesma regra, como função — para validar fora de um DTO (ex.: o formulário
 * web de redefinição de senha, que recebe `x-www-form-urlencoded`).
 */
export function isStrongPassword(password: unknown): password is string {
  return (
    typeof password === 'string' &&
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}
