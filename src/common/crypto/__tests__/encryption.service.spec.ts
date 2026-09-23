import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../encryption.service';

// Chave de teste: 32 bytes em hex (openssl rand -hex 32).
const TEST_KEY =
  '3e9c3ded29be54622a73784a9e5554b9ec3ae8b0c52e5a6be501b4137879faad';

describe('EncryptionService', () => {
  async function buildService(
    key: string | undefined,
  ): Promise<EncryptionService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: (path: string) =>
              path === 'encryption.key' ? key : undefined,
          },
        },
      ],
    }).compile();
    return module.get<EncryptionService>(EncryptionService);
  }

  it('faz round-trip de encrypt/decrypt', async () => {
    const service = await buildService(TEST_KEY);
    const plaintext = 'ya29.a0AfH6SMBy-refresh-token-secreto';

    const encrypted = service.encrypt(plaintext);

    expect(encrypted).not.toContain(plaintext);
    expect(service.decrypt(encrypted)).toBe(plaintext);
  });

  it('gera ciphertext diferente a cada chamada (IV aleatório)', async () => {
    const service = await buildService(TEST_KEY);

    const a = service.encrypt('mesmo-valor');
    const b = service.encrypt('mesmo-valor');

    expect(a).not.toBe(b);
    expect(service.decrypt(a)).toBe(service.decrypt(b));
  });

  it('rejeita payload adulterado (authTag inválido)', async () => {
    const service = await buildService(TEST_KEY);
    const [iv, , data] = service.encrypt('valor').split(':');
    const forged = [
      iv,
      Buffer.from('0'.repeat(16)).toString('base64'),
      data,
    ].join(':');

    expect(() => service.decrypt(forged)).toThrow();
  });

  it('rejeita payload malformado', async () => {
    const service = await buildService(TEST_KEY);
    expect(() => service.decrypt('sem-separadores')).toThrow(
      'Payload cifrado malformado.',
    );
  });

  it('falha quando ENCRYPTION_KEY está ausente', async () => {
    const service = await buildService(undefined);
    expect(() => service.encrypt('x')).toThrow('ENCRYPTION_KEY');
  });

  it('falha quando ENCRYPTION_KEY tem tamanho inválido', async () => {
    const service = await buildService('abcd');
    expect(() => service.encrypt('x')).toThrow('64 caracteres');
  });

  describe('assertConfigured', () => {
    it('passa quando a chave é válida', async () => {
      const service = await buildService(TEST_KEY);
      expect(() => service.assertConfigured()).not.toThrow();
    });

    it('acusa chave ausente sem precisar cifrar nada', async () => {
      const service = await buildService(undefined);
      expect(() => service.assertConfigured()).toThrow('ENCRYPTION_KEY');
    });

    it('acusa chave de tamanho inválido', async () => {
      const service = await buildService('abcd');
      expect(() => service.assertConfigured()).toThrow('64 caracteres');
    });
  });
});
