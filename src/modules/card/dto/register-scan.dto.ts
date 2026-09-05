import { Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * Localização de quem leu o QR da coleira, quando ela concorda em compartilhar.
 *
 * Tudo é opcional: a leitura sozinha já avisa o tutor de que alguém encontrou
 * o pet, e recusar a localização não pode impedir esse aviso.
 *
 * O `@ValidateIf` cruzado torna as coordenadas um par indivisível — meia
 * coordenada não localiza nada e entraria no banco como ruído silencioso.
 */
export class RegisterScanDto {
  @ValidateIf((o: RegisterScanDto) => o.longitude !== undefined)
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ValidateIf((o: RegisterScanDto) => o.latitude !== undefined)
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  /** Raio de precisão em metros informado pelo navegador de quem escaneou. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100_000)
  accuracy_meters?: number;
}
