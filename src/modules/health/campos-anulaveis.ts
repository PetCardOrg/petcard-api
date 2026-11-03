import { BadRequestException } from '@nestjs/common';

/**
 * Data opcional de um PATCH clínico: `null` limpa, ausente não mexe
 * (AUD API-24). O `dto.x ? new Date(dto.x) : undefined` de antes tratava
 * `null` como ausente, e a próxima dose apagada no formulário voltava.
 *
 * O tipo aceita `null` porque o DTO do shared declara só `string`, mas o
 * `@IsOptional` deixa `null` passar na validação.
 */
export function dataAnulavel(
  valor: string | null | undefined,
): Date | null | undefined {
  if (valor === null) return null;
  return valor ? new Date(valor) : undefined;
}

/**
 * O `@IsOptional` dos DTOs de PATCH deixa `null` passar também nos campos
 * obrigatórios. Sem esta recusa, o Prisma estourava na coluna NOT NULL (500)
 * — ou, nas datas, o `null` era ignorado em silêncio (AUD API-24).
 */
export function assertObrigatoriosNaoNulos(
  dto: object,
  campos: readonly string[],
): void {
  const nulos = campos.filter(
    (campo) => (dto as Record<string, unknown>)[campo] === null,
  );
  if (nulos.length > 0) {
    throw new BadRequestException(
      nulos.map((campo) => `${campo} não pode ser nulo.`),
    );
  }
}
