import { BadRequestException } from '@nestjs/common';

export const ANEXO_MAX_BYTES = 10 * 1024 * 1024;

/** Teto por registro: comprovante é uma ou duas fotos, não um álbum. */
export const ANEXO_MAX_POR_REGISTRO = 10;

/** Validade do link de leitura. Curto de propósito: cada abertura pede um novo. */
export const ANEXO_LINK_VALIDADE_SEGUNDOS = 300;

interface FormatoAceito {
  extensao: string;
  /** Assinatura real do formato, conferida nos primeiros bytes. */
  confere: (b: Buffer) => boolean;
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/**
 * `file.mimetype` é o `Content-Type` escrito pelo cliente — dado, não fato.
 * Aceitar o que ele declara deixaria subir HTML ou executável com rótulo de
 * imagem, e o objeto seria servido com esse tipo. Cada formato é confirmado
 * pelos bytes iniciais.
 */
const FORMATOS: Record<string, FormatoAceito> = {
  'image/jpeg': {
    extensao: 'jpg',
    confere: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8,
  },
  'image/png': {
    extensao: 'png',
    confere: (b) => b.length >= 8 && b.subarray(0, 8).equals(PNG_SIGNATURE),
  },
  'image/webp': {
    extensao: 'webp',
    confere: (b) =>
      b.length >= 12 &&
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  'application/pdf': {
    extensao: 'pdf',
    confere: (b) =>
      b.length >= 5 && b.subarray(0, 5).toString('ascii') === '%PDF-',
  },
};

export const ANEXO_TIPOS_ACEITOS = Object.keys(FORMATOS);

/** Confere o arquivo recebido e devolve a extensão canônica do formato. */
export function validarArquivo(file: Express.Multer.File | undefined): string {
  if (!file) {
    throw new BadRequestException('Nenhum arquivo enviado.');
  }
  const formato = FORMATOS[file.mimetype];
  if (!formato) {
    throw new BadRequestException(
      `Tipo de arquivo não aceito. Use: ${ANEXO_TIPOS_ACEITOS.join(', ')}.`,
    );
  }
  if (!file.buffer?.length) {
    throw new BadRequestException('Arquivo vazio.');
  }
  if (file.buffer.length > ANEXO_MAX_BYTES) {
    throw new BadRequestException('O arquivo excede o limite de 10 MB.');
  }
  if (!formato.confere(file.buffer)) {
    throw new BadRequestException(
      'O conteúdo do arquivo não corresponde ao tipo declarado.',
    );
  }
  return formato.extensao;
}

/**
 * Nome para exibição. Nunca entra na chave do objeto no bucket.
 *
 * O multer entrega `originalname` decodificado como latin1 mesmo quando o
 * cliente mandou UTF-8, o que transforma "vacina-cão.jpg" em mojibake.
 */
export function nomeDeExibicao(originalname: string, extensao: string): string {
  const utf8 = Buffer.from(originalname ?? '', 'latin1').toString('utf8');
  const limpo = utf8
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f/\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return limpo || `comprovante.${extensao}`;
}
