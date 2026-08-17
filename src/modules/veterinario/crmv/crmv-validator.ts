/**
 * Porta de validação de CRMV numa base externa (api#113).
 *
 * Não existe API oficial do CFMV para terceiros — a consulta pública é uma
 * página web. Por isso a validação fica atrás desta interface: o provedor é
 * detalhe de configuração, trocável sem tocar nas regras de negócio.
 */
export const CRMV_VALIDATOR = Symbol('CRMV_VALIDATOR');

export type CrmvValidationResult = {
  /** Registro encontrado e em situação regular. */
  valid: boolean;
  /** Situação devolvida pela base (ex.: "Ativo"), guardada para auditoria. */
  situacao?: string;
  /** Nome do profissional na base, para conferir contra o cadastro. */
  nome?: string;
};

export interface CrmvValidator {
  validate(crmv: string, uf: string): Promise<CrmvValidationResult>;
}
