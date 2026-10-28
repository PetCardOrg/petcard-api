import { nomesConferem } from '../crmv/nomes-conferem';

/**
 * O CRMV é público: sem conferir o nome, qualquer um se cadastra com o
 * registro de outro veterinário. A regra (D3) é primeiro e último nome iguais,
 * sem acento nem caixa — o vet pode omitir ou abreviar os nomes do meio.
 */
describe('nomesConferem', () => {
  const titular = 'CAMILA FERREIRA DE SOUZA';

  it.each([
    ['nome completo igual', 'Camila Ferreira de Souza'],
    ['sem acento e com caixa diferente', 'camila ferreira de souza'],
    ['nome do meio omitido', 'Camila Souza'],
    ['nome do meio abreviado', 'Camila F. Souza'],
    ['espaços sobrando', '  Camila   Souza '],
    ['com título de doutora', 'Dra. Camila Souza'],
  ])('confere: %s', (_caso, cadastro) => {
    expect(nomesConferem(cadastro, titular)).toBe(true);
  });

  it('ignora acentos dos dois lados', () => {
    expect(nomesConferem('José Antônio Araújo', 'JOSE ANTONIO ARAUJO')).toBe(
      true,
    );
  });

  it.each([
    ['outra pessoa', 'Marcos Andrade'],
    ['mesmo primeiro nome, outro sobrenome', 'Camila Oliveira'],
    ['só o primeiro nome', 'Camila'],
    ['sobrenome do meio no lugar do último', 'Camila Ferreira'],
  ])('não confere: %s', (_caso, cadastro) => {
    expect(nomesConferem(cadastro, titular)).toBe(false);
  });

  it('não confere nome vazio', () => {
    expect(nomesConferem('', titular)).toBe(false);
    expect(nomesConferem('Dra.', titular)).toBe(false);
  });
});
