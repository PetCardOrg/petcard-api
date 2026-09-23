import { IsString, MaxLength, MinLength } from 'class-validator';

export class GoogleLoginDto {
  /** ID token (JWT) devolvido pelo Google no app. */
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  idToken: string;
}
