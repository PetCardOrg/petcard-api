import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** O que vacina, vermífugo e medicação têm em comum para efeito de autoria. */
export interface RegistroComAutoria {
  veterinarioId?: string | null;
}

/**
 * Quem pode **editar** um registro clínico (web#34).
 *
 * A regra é de autoria, não de papel. Editar é o caso delicado: o registro
 * continua assinado por quem o criou, então alterar conteúdo alheio falsifica a
 * assinatura — a carteira mostraria "prescrito por Dra. Fulana, CRMV-SP 12345"
 * sobre uma dose que ela não prescreveu.
 *
 * O tutor que discorda da prescrição não a corrige: ele a remove da carteira,
 * e a original permanece no histórico (ver `assertPodeRemover`).
 */
export function assertPodeEditar(
  registro: RegistroComAutoria,
  userId: string,
  isVet: boolean,
): void {
  const autor = registro.veterinarioId ?? null;

  if (autor === null) {
    if (isVet) {
      throw new ForbiddenException(
        'Este registro foi feito pelo tutor; o veterinário não pode editá-lo.',
      );
    }
    return;
  }

  if (!isVet || autor !== userId) {
    throw new ForbiddenException(
      'Só o veterinário que fez o registro pode editá-lo.',
    );
  }
}

/**
 * Quem pode **remover** um registro clínico.
 *
 * Assimétrico de propósito. O tutor remove qualquer registro do próprio pet,
 * inclusive a prescrição que decidiu não seguir: é o caso central da api#117, e
 * a exclusão é lógica — sai da carteira dele e permanece no histórico, com a
 * ação registrada em seu nome. Impedi-lo aqui não tornaria o dado mais
 * confiável, só esconderia a recusa.
 *
 * O veterinário remove apenas o que ele mesmo prescreveu. O que o tutor
 * declarou não é dele para apagar.
 */
export function assertPodeRemover(
  registro: RegistroComAutoria,
  userId: string,
  isVet: boolean,
): void {
  if (!isVet) {
    return;
  }

  if ((registro.veterinarioId ?? null) !== userId) {
    throw new ForbiddenException(
      'O veterinário só pode remover os registros que ele mesmo fez.',
    );
  }
}

/**
 * Nome do veterinário que está registrando, para gravar junto com o registro.
 *
 * Resolvido no servidor de propósito: o cliente sabe o nome do próprio usuário,
 * mas aceitar esse nome no corpo da requisição deixaria qualquer um assinar um
 * registro clínico com o nome de outra pessoa.
 */
export async function nomeDoVeterinario(
  tx: Prisma.TransactionClient,
  veterinarioId: string,
): Promise<string | undefined> {
  const vet = await tx.veterinario.findUnique({
    where: { id: veterinarioId },
    select: { nome: true },
  });
  return vet?.nome;
}
