import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * `@Query('address')` entregava a string crua: o ValidationPipe global só age
 * sobre parâmetros tipados por classe, então nada limitava tamanho nem
 * garantia que o valor fosse mesmo uma string. A rota repassa a entrada para
 * uma API externa cobrada por chamada — vale recusar lixo antes de gastar.
 */
export class GeocodeQueryDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  address!: string;
}
