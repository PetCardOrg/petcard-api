import { randomUUID } from 'crypto';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Assinatura real de cada formato aceito.
 *
 * `file.mimetype` é o `Content-Type` que o cliente escreveu na parte do
 * multipart — dado, não fato. Conferir só ele deixava subir qualquer conteúdo
 * (HTML, SVG com script, executável) desde que a requisição dissesse
 * `image/png`, e o objeto ia para o S3 servido com esse tipo.
 */
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const MAGIC_NUMBERS: Record<string, (buffer: Buffer) => boolean> = {
  'image/jpeg': (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8,
  'image/png': (b) => b.length >= 8 && b.subarray(0, 8).equals(PNG_SIGNATURE),
  // Cabeçalho de WebP tem exatamente 12 bytes: "RIFF", o tamanho, e "WEBP".
  'image/webp': (b) =>
    b.length >= 12 &&
    b.subarray(0, 4).toString('ascii') === 'RIFF' &&
    b.subarray(8, 12).toString('ascii') === 'WEBP',
};

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly s3Client: S3Client | null;
  private readonly bucket: string | undefined;
  private readonly region: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get<string>('aws.region');
    this.bucket = this.configService.get<string>('aws.bucket');
    const accessKeyId = this.configService.get<string>('aws.accessKeyId');
    const secretAccessKey = this.configService.get<string>(
      'aws.secretAccessKey',
    );

    if (!this.region || !this.bucket || !accessKeyId || !secretAccessKey) {
      this.logger.warn(
        'AWS S3 credentials not fully configured — upload module disabled',
      );
      this.s3Client = null;
      return;
    }

    this.s3Client = new S3Client({
      region: this.region,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async uploadFile(file: Express.Multer.File, folder: string): Promise<string> {
    this.validateFile(file);

    if (!this.s3Client || !this.bucket) {
      throw new InternalServerErrorException(
        'S3 storage is not configured on the server',
      );
    }

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${folder}/${randomUUID()}-${safeName}`;

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
    } catch (error) {
      this.logger.error('Failed to upload file to S3', error as Error);
      throw new InternalServerErrorException('Failed to upload file');
    }

    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  async uploadBuffer(
    buffer: Buffer,
    key: string,
    contentType: string,
  ): Promise<string> {
    if (!this.s3Client || !this.bucket) {
      throw new InternalServerErrorException(
        'S3 storage is not configured on the server',
      );
    }

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        }),
      );
    } catch (error) {
      this.logger.error('Failed to upload buffer to S3', error as Error);
      throw new InternalServerErrorException('Failed to upload file');
    }

    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  /**
   * Remove um objeto do bucket a partir da URL pública dele.
   *
   * A URL precisa ser deste bucket: a chave saía do `pathname` de qualquer
   * endereço recebido, então uma URL forjada apontava o delete para qualquer
   * objeto do bucket, inclusive fora da pasta de uploads.
   */
  async deleteFile(fileUrl: string): Promise<void> {
    if (!this.s3Client || !this.bucket) {
      throw new InternalServerErrorException(
        'S3 storage is not configured on the server',
      );
    }

    const key = this.extractKeyFromUrl(fileUrl);
    if (!key) {
      throw new BadRequestException('Invalid file URL');
    }

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      this.logger.error('Failed to delete file from S3', error as Error);
      throw new InternalServerErrorException('Failed to delete file');
    }
  }

  private validateFile(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('File exceeds the 5MB size limit');
    }
    if (!file.buffer?.length) {
      throw new BadRequestException('Empty file');
    }
    if (!MAGIC_NUMBERS[file.mimetype](file.buffer)) {
      throw new BadRequestException(
        'File content does not match the declared image type',
      );
    }
  }

  private extractKeyFromUrl(fileUrl: string): string | null {
    try {
      const url = new URL(fileUrl);
      if (url.host !== `${this.bucket}.s3.${this.region}.amazonaws.com`) {
        return null;
      }
      const key = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      // Sem travessia e dentro de uma pasta conhecida.
      if (!key || key.includes('..') || !/^[\w.-]+\//.test(key)) {
        return null;
      }
      return key;
    } catch {
      return null;
    }
  }
}
