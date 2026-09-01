import { IsString, MaxLength, MinLength } from 'class-validator';
import { IsStrongPassword } from '../../../common/crypto/password.validators';

export class ResetPasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  token: string;

  @IsStrongPassword()
  password: string;
}
