import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MinLength, ValidateBy } from 'class-validator';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './password.constants';

const MENSAGEM_MAX_BYTES = `A senha deve ter no máximo ${PASSWORD_MAX_LENGTH} bytes. Letras acentuadas contam como 2 e emoji como 4.`;

/**
 * O teto é do bcrypt, que corta em 72 bytes UTF-8. `MaxLength` conta
 * unidades UTF-16: 40 letras acentuadas passavam com 80 bytes e a senha
 * gravada era só o começo do que a pessoa digitou (AUD API-20). Mesma regra e
 * mesma mensagem do `IsStrongPassword` do shared (SH-02).
 */
function cabeNoBcrypt(password: string): boolean {
  return Buffer.byteLength(password, 'utf8') <= PASSWORD_MAX_LENGTH;
}

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
    ValidateBy({
      name: 'maxBytes',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && cabeNoBcrypt(value),
        defaultMessage: () => MENSAGEM_MAX_BYTES,
      },
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
    cabeNoBcrypt(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}
