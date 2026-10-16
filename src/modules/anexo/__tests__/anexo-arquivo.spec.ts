import { BadRequestException } from '@nestjs/common';
import {
  ANEXO_MAX_BYTES,
  nomeDeExibicao,
  validarArquivo,
} from '../anexo-arquivo';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('x'),
]);
const PDF = Buffer.from('%PDF-1.7\n...');
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WEBP'),
]);

const arquivo = (mimetype: string, buffer: Buffer): Express.Multer.File =>
  ({ mimetype, buffer, originalname: 'x' }) as Express.Multer.File;

describe('validarArquivo', () => {
  it.each([
    ['image/jpeg', JPEG, 'jpg'],
    ['image/png', PNG, 'png'],
    ['image/webp', WEBP, 'webp'],
    ['application/pdf', PDF, 'pdf'],
  ])('aceita %s e devolve a extensão canônica', (mime, buf, ext) => {
    expect(validarArquivo(arquivo(mime, buf))).toBe(ext);
  });

  it('recusa conteúdo que não bate com o tipo declarado', () => {
    // HTML rotulado de PDF: o que o rótulo diz não vale, os bytes sim.
    expect(() =>
      validarArquivo(
        arquivo('application/pdf', Buffer.from('<script>alert(1)</script>')),
      ),
    ).toThrow(BadRequestException);
    expect(() => validarArquivo(arquivo('image/png', JPEG))).toThrow(
      BadRequestException,
    );
  });

  it('recusa tipo fora da lista, mesmo com conteúdo válido', () => {
    expect(() =>
      validarArquivo(arquivo('image/svg+xml', Buffer.from('<svg/>'))),
    ).toThrow(BadRequestException);
    expect(() =>
      validarArquivo(arquivo('image/gif', Buffer.from('GIF89a'))),
    ).toThrow(BadRequestException);
  });

  it('recusa ausência, arquivo vazio e arquivo acima de 10 MB', () => {
    expect(() => validarArquivo(undefined)).toThrow(BadRequestException);
    expect(() => validarArquivo(arquivo('image/png', Buffer.alloc(0)))).toThrow(
      BadRequestException,
    );
    const grande = Buffer.concat([PDF, Buffer.alloc(ANEXO_MAX_BYTES)]);
    expect(() => validarArquivo(arquivo('application/pdf', grande))).toThrow(
      BadRequestException,
    );
  });
});

describe('nomeDeExibicao', () => {
  it('repara o UTF-8 que o multer entrega decodificado como latin1', () => {
    const recebido = Buffer.from('vacina-cão.jpg', 'utf8').toString('latin1');
    expect(nomeDeExibicao(recebido, 'jpg')).toBe('vacina-cão.jpg');
  });

  it('remove separador de caminho e caractere de controle', () => {
    expect(nomeDeExibicao('../../etc/passwd\u0000.png', 'png')).toBe(
      '....etcpasswd.png',
    );
    expect(nomeDeExibicao('a\\b\nc.pdf', 'pdf')).toBe('abc.pdf');
  });

  it('limita o tamanho e cai num nome padrão quando nada sobra', () => {
    expect(nomeDeExibicao('a'.repeat(500), 'png')).toHaveLength(120);
    expect(nomeDeExibicao('///', 'pdf')).toBe('comprovante.pdf');
    expect(nomeDeExibicao('', 'jpg')).toBe('comprovante.jpg');
  });
});
