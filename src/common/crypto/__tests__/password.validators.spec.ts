import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../password.constants';
import { IsStrongPassword, isStrongPassword } from '../password.validators';

class SenhaDto {
  @IsStrongPassword()
  password!: string;
}

function erros(password: string): string[] {
  const [erro] = validateSync(plainToInstance(SenhaDto, { password }));
  return Object.values(erro?.constraints ?? {});
}

/**
 * O teto é do bcrypt, que conta bytes UTF-8, não caracteres (AUD API-20).
 * Com `MaxLength`, 40 letras acentuadas passavam com 80 bytes e a senha
 * gravada era só o começo do que a pessoa digitou.
 */
describe('regra de senha forte: teto em bytes', () => {
  const ascii72 = 'Aa1!'.repeat(18);
  // 43 caracteres, 83 bytes: cada "á" ocupa 2.
  const acentuada = 'A1!' + 'á'.repeat(40);
  // 39 unidades UTF-16, 75 bytes: cada emoji ocupa 4.
  const comEmoji = 'A1!' + '🐶'.repeat(18);

  it('aceita 72 bytes em ASCII', () => {
    expect(Buffer.byteLength(ascii72)).toBe(PASSWORD_MAX_LENGTH);
    expect(erros(ascii72)).toEqual([]);
    expect(isStrongPassword(ascii72)).toBe(true);
  });

  it('recusa letras acentuadas que passam de 72 bytes', () => {
    expect(acentuada.length).toBeLessThanOrEqual(PASSWORD_MAX_LENGTH);
    expect(erros(acentuada)).toEqual([
      'A senha deve ter no máximo 72 bytes. Letras acentuadas contam como 2 e emoji como 4.',
    ]);
    expect(isStrongPassword(acentuada)).toBe(false);
  });

  it('recusa emoji que passa de 72 bytes', () => {
    expect(erros(comEmoji)).not.toEqual([]);
    expect(isStrongPassword(comEmoji)).toBe(false);
  });

  it('aceita acentuadas até 72 bytes', () => {
    // 3 + 2×34 = 71 bytes.
    const cabe = 'A1!' + 'á'.repeat(34);
    expect(erros(cabe)).toEqual([]);
    expect(isStrongPassword(cabe)).toBe(true);
  });
});
