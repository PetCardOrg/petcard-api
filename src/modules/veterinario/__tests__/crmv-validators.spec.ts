import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InfosimplesCrmvValidator } from '../crmv/infosimples-crmv.validator';
import { StubCrmvValidator } from '../crmv/stub-crmv.validator';

const makeConfig = (token?: string): ConfigService =>
  ({
    get: jest.fn((chave: string) => {
      if (chave === 'crmv.infosimplesToken') return token;
      if (chave === 'crmv.timeoutMs') return 15000;
      return undefined;
    }),
  }) as unknown as ConfigService;

const okResponse = (body: unknown) =>
  ({ ok: true, json: () => Promise.resolve(body) }) as unknown as Response;

/** Envelope real da Infosimples: data[] agrupa consultas, resultados[] traz os registros. */
const respostaCfmv = (resultados: unknown[]) =>
  okResponse({
    code: 200,
    code_message: 'A requisição foi processada com sucesso.',
    errors: [],
    data_count: 1,
    data: [{ resultados, site_receipt: 'https://exemplo/recibo' }],
  });

describe('StubCrmvValidator', () => {
  const validator = new StubCrmvValidator();

  it('aceita CRMV bem formado sem consultar nada', async () => {
    await expect(validator.validate('12345', 'SP')).resolves.toMatchObject({
      valid: true,
    });
  });

  it('recusa o CRMV reservado para demonstrar a negativa', async () => {
    await expect(validator.validate('00000', 'SP')).resolves.toMatchObject({
      valid: false,
    });
  });

  it('recusa entrada sem dígitos', async () => {
    await expect(validator.validate('abc', 'SP')).resolves.toMatchObject({
      valid: false,
    });
  });
});

describe('InfosimplesCrmvValidator', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('falha claramente quando o token não está configurado', async () => {
    const validator = new InfosimplesCrmvValidator(makeConfig(undefined));

    await expect(validator.validate('12345', 'SP')).rejects.toThrow(
      /INFOSIMPLES_TOKEN/,
    );
  });

  it('considera regular quando a situação é ativo', async () => {
    // A API devolve a situação em minúsculas.
    global.fetch = jest.fn().mockResolvedValue(
      respostaCfmv([
        {
          nome: 'Camila Ferreira',
          crmv: '12345',
          situacao: 'ativo',
          uf: 'SP',
        },
      ]),
    );
    const validator = new InfosimplesCrmvValidator(makeConfig('tok'));

    await expect(validator.validate('12345', 'SP')).resolves.toEqual({
      valid: true,
      situacao: 'ativo',
      nome: 'Camila Ferreira',
    });
  });

  it('lê o registro dentro de data[].resultados[], não de data[]', async () => {
    // Guarda contra a leitura ingênua do envelope: sem descer em `resultados`
    // nenhum registro é encontrado e todo vet seria recusado.
    global.fetch = jest
      .fn()
      .mockResolvedValue(respostaCfmv([{ situacao: 'ativo', nome: 'X' }]));
    const validator = new InfosimplesCrmvValidator(makeConfig('tok'));

    await expect(validator.validate('12345', 'SP')).resolves.toMatchObject({
      valid: true,
    });
  });

  it('recusa situação irregular', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        respostaCfmv([{ nome: 'Fulano', crmv: '12345', situacao: 'Suspenso' }]),
      );
    const validator = new InfosimplesCrmvValidator(makeConfig('tok'));

    await expect(validator.validate('12345', 'SP')).resolves.toMatchObject({
      valid: false,
      situacao: 'Suspenso',
    });
  });

  it('recusa quando a consulta não encontra registro', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(okResponse({ code: 612, code_message: 'sem dados' }));
    const validator = new InfosimplesCrmvValidator(makeConfig('tok'));

    await expect(validator.validate('12345', 'SP')).resolves.toMatchObject({
      valid: false,
    });
  });

  it('não culpa o veterinário por erro de conta (7xx)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        okResponse({ code: 702, code_message: 'sem crédito' }),
      );
    const validator = new InfosimplesCrmvValidator(makeConfig('tok'));

    await expect(validator.validate('12345', 'SP')).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('converte falha de rede em 502', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));
    const validator = new InfosimplesCrmvValidator(makeConfig('tok'));

    await expect(validator.validate('12345', 'SP')).rejects.toThrow(
      /não foi possível consultar/i,
    );
  });

  it('envia token, crmv e uf na consulta', async () => {
    const fetchMock = jest.fn().mockResolvedValue(respostaCfmv([]));
    global.fetch = fetchMock;
    const validator = new InfosimplesCrmvValidator(makeConfig('tok-123'));

    await validator.validate('12345', 'SP');

    const [[url]] = fetchMock.mock.calls as Array<[URL]>;
    expect(url.searchParams.get('token')).toBe('tok-123');
    expect(url.searchParams.get('query')).toBe('12345');
    expect(url.searchParams.get('uf')).toBe('SP');
    // Veterinário é pessoa física (0); a clínica seria 1.
    expect(url.searchParams.get('tipo_inscricao')).toBe('0');
  });

  it('recusa quando a consulta volta sem resultados', async () => {
    global.fetch = jest.fn().mockResolvedValue(respostaCfmv([]));
    const validator = new InfosimplesCrmvValidator(makeConfig('tok'));

    await expect(validator.validate('12345', 'SP')).resolves.toMatchObject({
      valid: false,
    });
  });
});
