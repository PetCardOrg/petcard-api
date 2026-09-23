import { Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Entrada do autocomplete de local do agendamento.
 *
 * A rota é chamada a cada tecla digitada e repassa a entrada para uma API
 * cobrada por chamada, então o piso de 3 caracteres não é cosmético: ele evita
 * pagar por consulta que o Google responderia com ruído de qualquer jeito.
 */
export class AutocompleteQueryDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  input!: string;

  /**
   * Viés de localização — resultados perto do tutor primeiro. Opcional porque
   * a permissão de localização pode estar negada; sem ela o Google usa o IP.
   */
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  /**
   * Agrupa as teclas de uma mesma edição numa sessão de cobrança do Places.
   * Sem ele cada tecla vira uma chamada faturada isoladamente.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionToken?: string;
}
