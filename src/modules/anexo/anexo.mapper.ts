import { AnexoClinico } from '@prisma/client';
import { AnexoResponseDto, EntidadeClinica, Role } from '@petcardorg/shared';

/**
 * `include` para trazer os comprovantes ativos junto do registro. Anexo
 * removido continua no banco, mas não aparece na carteira.
 */
export const ANEXOS_ATIVOS = {
  anexos: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
} as const;

export function toAnexoResponseDto(anexo: AnexoClinico): AnexoResponseDto {
  const { entidade, entidadeId } = alvoDoAnexo(anexo);
  return {
    id: anexo.id,
    pet_id: anexo.petId,
    entidade,
    entidade_id: entidadeId,
    nome_arquivo: anexo.nomeArquivo,
    mime_type: anexo.mimeType,
    tamanho_bytes: anexo.tamanhoBytes,
    enviado_por_tipo: anexo.enviadoPorTipo as unknown as Role,
    enviado_por_id: anexo.enviadoPorId,
    enviado_por_nome: anexo.enviadoPorNome,
    verificado: anexo.verificadoEm !== null,
    verificado_em: anexo.verificadoEm ?? undefined,
    verificado_por_nome: anexo.verificadoPorNome ?? undefined,
    verificado_por_crmv: anexo.verificadoPorCrmv ?? undefined,
    created_at: anexo.createdAt,
  };
}

/** Qual registro o anexo comprova. O CHECK do banco garante que é exatamente um. */
export function alvoDoAnexo(anexo: AnexoClinico): {
  entidade: EntidadeClinica;
  entidadeId: string;
} {
  if (anexo.vaccineRecordId) {
    return {
      entidade: EntidadeClinica.VACINA,
      entidadeId: anexo.vaccineRecordId,
    };
  }
  if (anexo.dewormingRecordId) {
    return {
      entidade: EntidadeClinica.VERMIFUGO,
      entidadeId: anexo.dewormingRecordId,
    };
  }
  return {
    entidade: EntidadeClinica.MEDICACAO,
    entidadeId: anexo.medicationRecordId as string,
  };
}
