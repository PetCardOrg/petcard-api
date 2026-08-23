/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadService } from '../upload.service';

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({ __kind: 'Put', input })),
  DeleteObjectCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({ __kind: 'Delete', input })),
}));

const FULL_AWS: Record<string, string> = {
  'aws.region': 'us-east-1',
  'aws.bucket': 'petcard-bucket',
  'aws.accessKeyId': 'AKIA-test',
  'aws.secretAccessKey': 'secret-test',
};

const makeConfig = (
  values: Record<string, string | undefined>,
): ConfigService =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

/** Assinatura de um PNG de verdade — o serviço confere os bytes, não o header. */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_BUFFER = Buffer.concat([PNG_MAGIC, Buffer.from('conteudo')]);

const makeFile = (
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File =>
  ({
    originalname: 'foto do rex!.png',
    mimetype: 'image/png',
    size: 1024,
    buffer: PNG_BUFFER,
    ...overrides,
  }) as Express.Multer.File;

describe('UploadService', () => {
  afterEach(() => jest.clearAllMocks());

  describe('quando o S3 está configurado', () => {
    let service: UploadService;
    beforeEach(() => {
      service = new UploadService(makeConfig(FULL_AWS));
    });

    it('faz upload de arquivo, sanitiza o nome e retorna a URL pública', async () => {
      mockSend.mockResolvedValue({});

      const url = await service.uploadFile(makeFile(), 'pets');

      expect(url).toMatch(
        /^https:\/\/petcard-bucket\.s3\.us-east-1\.amazonaws\.com\/pets\/[0-9a-f-]+-foto_do_rex_\.png$/,
      );
      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0] as {
        input: { Bucket: string; ContentType: string };
      };
      expect(command.input.Bucket).toBe('petcard-bucket');
      expect(command.input.ContentType).toBe('image/png');
    });

    it('rejeita arquivo ausente', async () => {
      await expect(
        service.uploadFile(undefined as unknown as Express.Multer.File, 'pets'),
      ).rejects.toThrow(BadRequestException);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('rejeita mime type não permitido', async () => {
      await expect(
        service.uploadFile(makeFile({ mimetype: 'application/pdf' }), 'pets'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejeita conteúdo que não bate com o mime declarado', async () => {
      // O mimetype é escrito pelo cliente. Aceitar só ele deixava subir HTML
      // ou script dizendo ser PNG.
      await expect(
        service.uploadFile(
          makeFile({ buffer: Buffer.from('<html>nao sou imagem</html>') }),
          'pets',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('aceita JPEG e WebP pela assinatura real', async () => {
      await expect(
        service.uploadFile(
          makeFile({
            mimetype: 'image/jpeg',
            buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]),
          }),
          'pets',
        ),
      ).resolves.toContain('https://');

      const webp = Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.from([0, 0, 0, 0]),
        Buffer.from('WEBP'),
      ]);
      await expect(
        service.uploadFile(
          makeFile({ mimetype: 'image/webp', buffer: webp }),
          'pets',
        ),
      ).resolves.toContain('https://');
    });

    it('rejeita JPEG cujos bytes são de outro formato', async () => {
      await expect(
        service.uploadFile(
          makeFile({ mimetype: 'image/jpeg', buffer: PNG_BUFFER }),
          'pets',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejeita arquivo vazio', async () => {
      await expect(
        service.uploadFile(makeFile({ buffer: Buffer.alloc(0) }), 'pets'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejeita arquivo acima de 5MB', async () => {
      await expect(
        service.uploadFile(makeFile({ size: 6 * 1024 * 1024 }), 'pets'),
      ).rejects.toThrow(BadRequestException);
    });

    it('converte falha do S3 em InternalServerErrorException no uploadFile', async () => {
      mockSend.mockRejectedValue(new Error('network'));
      await expect(service.uploadFile(makeFile(), 'pets')).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('faz upload de buffer e retorna a URL com a key informada', async () => {
      mockSend.mockResolvedValue({});
      const url = await service.uploadBuffer(
        Buffer.from('x'),
        'qr-codes/pet-1.png',
        'image/png',
      );
      expect(url).toBe(
        'https://petcard-bucket.s3.us-east-1.amazonaws.com/qr-codes/pet-1.png',
      );
    });

    it('deleta arquivo extraindo a key da URL', async () => {
      mockSend.mockResolvedValue({});
      await service.deleteFile(
        'https://petcard-bucket.s3.us-east-1.amazonaws.com/pets/abc-foto.png',
      );
      const command = mockSend.mock.calls[0][0] as {
        input: { Key: string };
      };
      expect(command.input.Key).toBe('pets/abc-foto.png');
    });

    it('rejeita URL inválida no deleteFile', async () => {
      await expect(service.deleteFile('not-a-url')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('quando o S3 NÃO está configurado', () => {
    let service: UploadService;
    beforeEach(() => {
      service = new UploadService(makeConfig({ 'aws.region': 'us-east-1' }));
    });

    it('uploadFile lança InternalServerErrorException', async () => {
      await expect(service.uploadFile(makeFile(), 'pets')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
