import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateVeterinarioDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  nome?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  crmv?: string;

  @IsOptional()
  @IsString()
  telefone?: string;
}
