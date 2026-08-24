import { IsEmail, IsString, MaxLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../../../common/crypto/password.constants';

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  // Sem teto, o corpo do login era ilimitado e cada tentativa arrastava o
  // bcrypt junto. O login não exige tamanho mínimo — senha antiga curta
  // continua entrando; o mínimo vale para quem cadastra.
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}
