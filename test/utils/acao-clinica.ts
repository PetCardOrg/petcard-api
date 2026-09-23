import { AcaoClinicaService } from '../../src/modules/historico/acao-clinica.service';

/**
 * Provider da trilha de auditoria para specs (api#117).
 *
 * A gravação em si tem spec própria; aqui interessa só que os serviços
 * clínicos a chamem, então o dublê registra as chamadas.
 */
export function acaoClinicaProvider(registrar = jest.fn()) {
  return {
    registrar,
    provider: { provide: AcaoClinicaService, useValue: { registrar } },
  };
}

/**
 * Faz o mock do Prisma executar callbacks de `$transaction` contra ele mesmo.
 * Sem isto, os serviços que agrupam escrita + trilha numa transação quebram
 * nos specs que mockam o Prisma.
 */
export function comTransacao<T extends object>(prismaMock: T): T {
  return Object.assign(prismaMock, {
    $transaction: jest.fn(
      (cb: (tx: T) => Promise<unknown>): Promise<unknown> => cb(prismaMock),
    ),
  });
}
