/** Títulos que o vet põe no nome e o registro do conselho não traz. */
const TITULOS = new Set(['dr', 'dra', 'doutor', 'doutora']);

/** Minúsculas, sem acento nem pontuação, um nome por posição. */
function partesDoNome(nome: string): string[] {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((parte) => parte && !TITULOS.has(parte));
}

/**
 * O nome do cadastro corresponde ao titular do CRMV? Basta o primeiro e o
 * último nome baterem (decisão D3): o vet costuma omitir ou abreviar os do
 * meio, e exigir o nome completo recusaria quem é dono do registro.
 */
export function nomesConferem(cadastro: string, titular: string): boolean {
  const a = partesDoNome(cadastro);
  const b = partesDoNome(titular);
  if (a.length < 2 || b.length < 2) return false;
  return a[0] === b[0] && a[a.length - 1] === b[b.length - 1];
}
