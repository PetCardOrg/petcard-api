/**
 * O que quem encontrou o pet vê ao ler o QR da coleira.
 *
 * Deliberadamente enxuto: só o que ajuda a devolver o animal. Nada de vacinas,
 * vermifugações ou medicações — quem lê este QR é um estranho na rua, e o
 * histórico clínico não o ajuda a devolver o pet. A carteira digital, essa sim,
 * continua carregando tudo, para tutor e veterinário.
 */
export class ColeiraPublicResponseDto {
  pet_id!: string;
  pet_name!: string;
  species!: string;
  breed?: string;
  sex!: string;
  photo_url?: string;

  tutor_name!: string;
  /** Ausente quando o tutor não cadastrou telefone — a página se adapta. */
  tutor_phone?: string;
}
