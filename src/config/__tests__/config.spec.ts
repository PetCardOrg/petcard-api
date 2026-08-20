import { appConfig } from '../app.config';
import { firebaseConfig } from '../firebase.config';

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
});
