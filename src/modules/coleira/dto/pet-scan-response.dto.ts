/**
 * Uma leitura do QR da coleira.
 *
 * DTO local ao módulo: o `@petcardorg/shared` só publica em push para a `main`
 * daquele repo, e o CLI plugin do Swagger não infere schema de tipo vindo de
 * pacote externo — local, a rota nasce documentada.
 */
export class PetScanResponseDto {
  id!: string;
  pet_id!: string;

  /** Ausentes quando quem escaneou recusou compartilhar a localização. */
  latitude?: number;
  longitude?: number;
  accuracy_meters?: number;

  created_at!: string;
}
