import { Injectable, Logger } from '@nestjs/common';
import type { CrmvValidationResult, CrmvValidator } from './crmv-validator';

/** CRMV reservado para demonstrar o caminho de recusa. */
const CRMV_INVALIDO_DEMO = '00000';

/**
 * Validador determinístico para desenvolvimento, testes e demonstração.
 *
 * A consulta real é paga por chamada e depende de rede — nem o CI nem a
 * gravação do vídeo podem depender dela. Aqui todo CRMV bem formado é aceito,
 * exceto o reservado acima, que permite exercitar a recusa na demo.
 */
@Injectable()
export class StubCrmvValidator implements CrmvValidator {
  private readonly logger = new Logger(StubCrmvValidator.name);

  validate(crmv: string, uf: string): Promise<CrmvValidationResult> {
    this.logger.warn(
      `Validando CRMV ${crmv}/${uf} pelo stub — nenhuma consulta externa foi feita.`,
    );

    const digitos = crmv.replace(/\D/g, '');
    if (!digitos || digitos === CRMV_INVALIDO_DEMO) {
      return Promise.resolve({ valid: false, situacao: 'Não encontrado' });
    }

    return Promise.resolve({ valid: true, situacao: 'Ativo (stub)' });
  }
}
