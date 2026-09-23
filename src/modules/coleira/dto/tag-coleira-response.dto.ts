/**
 * O QR da coleira, na visão do tutor dono.
 *
 * Endpoint próprio em vez de campo novo no `PetResponseDto`: aquele DTO vive
 * no `@petcardorg/shared`, que só publica em push para a `main` daquele repo —
 * mudá-lo travaria esta entrega num ciclo de release de outro repositório.
 */
export class TagColeiraResponseDto {
  pet_id!: string;
  /** Imagem PNG no S3. Ausente enquanto a fila ainda não gerou. */
  qr_code_url?: string;
  /** Endereço que o QR carrega — serve para compartilhar sem a imagem. */
  public_url!: string;
}
