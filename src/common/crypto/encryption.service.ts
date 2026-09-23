import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // nonce de 96 bits, recomendado para GCM
const KEY_LENGTH = 32; // 256 bits
const SEPARATOR = ':';

/**
 * Cifra dados sensíveis em repouso com AES-256-GCM (ADR-002 #4 / RNF de
 * criptografia do DAS). Usada para os tokens OAuth do Google Calendar.
 *
 * Formato do payload cifrado: `iv:authTag:ciphertext`, cada parte em base64.
 * A chave (`ENCRYPTION_KEY`) é lida sob demanda para não obrigar sua presença
 * no boot quando o Calendar não está configurado.
 */
@Injectable()
export class EncryptionService {
  constructor(private readonly configService: ConfigService) {}

  private getKey(): Buffer {
    const raw = this.configService.get<string>('encryption.key');
    if (!raw) {
      throw new Error(
        'ENCRYPTION_KEY é obrigatória para cifrar/decifrar tokens OAuth.',
      );
    }
    const key = Buffer.from(raw, 'hex');
    if (key.length !== KEY_LENGTH) {
      throw new Error(
        `ENCRYPTION_KEY deve ter ${KEY_LENGTH} bytes em hexadecimal (64 caracteres). Gere com: openssl rand -hex 32`,
      );
    }
    return key;
  }

  /**
   * Valida a configuração sem cifrar nada. Serve para falhar antes de operações
   * irreversíveis — o código OAuth do Google é de uso único, então descobrir a
   * chave ausente só na hora de cifrar obriga o usuário a refazer o consentimento.
   */
  assertConfigured(): void {
    this.getKey();
  }

  encrypt(plaintext: string): string {
    const key = this.getKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [
      iv.toString('base64'),
      authTag.toString('base64'),
      ciphertext.toString('base64'),
    ].join(SEPARATOR);
  }

  decrypt(payload: string): string {
    const key = this.getKey();
    const [ivB64, tagB64, dataB64] = payload.split(SEPARATOR);
    if (!ivB64 || !tagB64 || !dataB64) {
      throw new Error('Payload cifrado malformado.');
    }
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  }
}
