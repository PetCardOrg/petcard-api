import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateVeterinarioDto {
  @IsString()
  @MinLength(2)
  nome: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @MinLength(3)
  crmv: string;

  @IsOptional()
  @IsString()
  telefone?: string;
}
