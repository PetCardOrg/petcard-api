import { appConfig } from '../app.config';
import { firebaseConfig } from '../firebase.config';
import { authConfig } from '../auth.config';
import { throttlerConfig } from '../throttler.config';

/**
 * Só o que morde de verdade na configuração.
 *
 * A maioria das factories apenas repassa `process.env` para um objeto — quebrar
 * isso não quebra regra de negócio nenhuma. Ficam aqui as duas famílias que já
 * causaram (ou causariam) incidente: a que derruba o boot de propósito quando
 * falta configuração crítica, e o parsing de variável de ambiente que engana,
 * porque toda variável é string e `'false'` é verdadeiro.
 */
const CHAVES = [
  'NODE_ENV',
  'CORS_ORIGINS',
  'FCM_ENABLED',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'AUTH_THROTTLE_LIMIT',
  'AUTH_THROTTLE_TTL_SECONDS',
  'JWT_SECRET',
] as const;

describe('configuração de ambiente', () => {
  const original: Partial<Record<string, string>> = {};

  beforeAll(() => {
    for (const chave of CHAVES) original[chave] = process.env[chave];
  });

  beforeEach(() => {
    for (const chave of CHAVES) delete process.env[chave];
  });

  afterAll(() => {
    for (const chave of CHAVES) {
      if (original[chave] === undefined) delete process.env[chave];
      else process.env[chave] = original[chave];
    }
  });

  describe('CORS', () => {
    it('recusa subir em produção sem origens declaradas', () => {
      process.env.NODE_ENV = 'production';

      // Falha rápida no boot: subir liberando qualquer origem seria pior.
      expect(() => appConfig()).toThrow(
        'CORS_ORIGINS is required in production',
      );
    });

    it('aceita a lista com espaços e entradas vazias', () => {
      process.env.NODE_ENV = 'production';
      process.env.CORS_ORIGINS =
        ' https://app.petcard.app , https://vet.petcard.app ,, ';

      // Valor colado em painel de deploy vem sujo; origem com espaço nunca
      // casaria com o header do navegador.
      expect(appConfig().corsOrigins).toEqual([
        'https://app.petcard.app',
        'https://vet.petcard.app',
      ]);
    });

    it('trata variável em branco como ausente fora de produção', () => {
      process.env.CORS_ORIGINS = '   ';

      expect(appConfig().corsOrigins).toContain('http://localhost:5173');
    });
  });

  describe('credenciais do FCM', () => {
    it('recusa subir habilitado sem as credenciais completas', () => {
      process.env.FCM_ENABLED = 'true';
      process.env.FIREBASE_PROJECT_ID = 'petcard';

      // Sem isso o erro só apareceria no primeiro push que não chegasse.
      expect(() => firebaseConfig()).toThrow(
        'FCM_ENABLED=true requires FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY to be set.',
      );
    });

    it('entende FCM_ENABLED=false como desligado', () => {
      process.env.FCM_ENABLED = 'false';

      // `'false'` é string verdadeira: ler sem comparar ligaria o push.
      expect(firebaseConfig().enabled).toBe(false);
    });

    it('desescapa a quebra de linha da chave privada', () => {
      process.env.FCM_ENABLED = 'true';
      process.env.FIREBASE_PROJECT_ID = 'petcard';
      process.env.FIREBASE_CLIENT_EMAIL = 'sdk@petcard.iam.gserviceaccount.com';
      process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN\\nKEY-----';

      // A chave vem do JSON do service account com `\n` literal; sem desescapar,
      // o Firebase Admin recusa a credencial.
      expect(firebaseConfig().privateKey).toBe('-----BEGIN\nKEY-----');
    });
  });

  describe('rate limit das rotas de autenticação', () => {
    it('usa os padrões quando o ambiente não diz nada', () => {
      expect(throttlerConfig()).toEqual({ authTtlSeconds: 60, authLimit: 10 });
    });

    it('respeita os valores declarados', () => {
      process.env.AUTH_THROTTLE_LIMIT = '3';
      process.env.AUTH_THROTTLE_TTL_SECONDS = '120';

      expect(throttlerConfig()).toEqual({
        authTtlSeconds: 120,
        authLimit: 3,
      });
    });

    it('ignora valor inválido em vez de desligar o limite', () => {
      // NaN como limite faz o throttler liberar tudo: o erro de digitação
      // derrubaria em silêncio a proteção de força bruta.
      process.env.AUTH_THROTTLE_LIMIT = 'dez';
      process.env.AUTH_THROTTLE_TTL_SECONDS = '0';

      expect(throttlerConfig()).toEqual({ authTtlSeconds: 60, authLimit: 10 });
    });
  });

  describe('segredo do JWT', () => {
    it('recusa subir em produção sem segredo', () => {
      process.env.NODE_ENV = 'production';

      expect(() => authConfig()).toThrow(/JWT_SECRET is required/);
    });

    it('recusa segredo curto demais em produção', () => {
      // Segredo curto é adivinhável, e quem o adivinha emite token de
      // qualquer usuário.
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'curto';

      expect(() => authConfig()).toThrow(/at least 32 characters/);
    });

    it('aceita segredo longo em produção', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(32);

      expect(authConfig().jwtSecret).toHaveLength(32);
    });

    it('não trava o desenvolvimento local sem segredo', () => {
      expect(authConfig().jwtSecret).toBeUndefined();
    });
  });
});
