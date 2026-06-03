import { registerAs } from '@nestjs/config';

export const encryptionConfig = registerAs('encryption', () => ({
  // Chave AES-256-GCM em hexadecimal (32 bytes => 64 caracteres hex).
  // Gere com: openssl rand -hex 32
  key: process.env.ENCRYPTION_KEY,
}));
