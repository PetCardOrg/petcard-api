import { appConfig } from '../app.config';
import { authConfig } from '../auth.config';
import { awsConfig } from '../aws.config';
import { cardConfig } from '../card.config';
import { encryptionConfig } from '../encryption.config';
import { firebaseConfig } from '../firebase.config';
import { googleCalendarConfig } from '../google-calendar.config';
import { googleMapsConfig } from '../google-maps.config';
import { rabbitmqConfig } from '../rabbitmq.config';
import { reminderConfig } from '../reminder.config';

const MANAGED_ENV_KEYS = [
  'NODE_ENV',
  'CORS_ORIGINS',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_S3_BUCKET',
  'PUBLIC_CARD_BASE_URL',
  'PUBLIC_CARD_THROTTLE_TTL_SECONDS',
  'PUBLIC_CARD_THROTTLE_LIMIT',
  'ENCRYPTION_KEY',
  'FCM_ENABLED',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'GOOGLE_CALENDAR_CLIENT_ID',
  'GOOGLE_CALENDAR_CLIENT_SECRET',
  'GOOGLE_CALENDAR_REDIRECT_URI',
  'GOOGLE_MAPS_API_KEY',
  'RABBITMQ_URL',
  'RABBITMQ_QR_CODE_QUEUE',
  'RABBITMQ_QR_CODE_DLQ',
  'RABBITMQ_NOTIFICATION_PUSH_QUEUE',
  'RABBITMQ_NOTIFICATION_PUSH_DLQ',
  'RABBITMQ_CALENDAR_SYNC_QUEUE',
  'RABBITMQ_CALENDAR_SYNC_DLQ',
  'DOSE_REMINDER_ENABLED',
  'DOSE_REMINDER_WINDOW_DAYS',
] as const;

describe('config factories', () => {
  const originalEnv: Partial<Record<string, string>> = {};

  beforeAll(() => {
    for (const key of MANAGED_ENV_KEYS) {
      originalEnv[key] = process.env[key];
    }
  });

  beforeEach(() => {
    for (const key of MANAGED_ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterAll(() => {
    for (const key of MANAGED_ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  describe('appConfig', () => {
    it('should default to development with localhost CORS origins', () => {
      const config = appConfig();

      expect(config.nodeEnv).toBe('development');
      expect(config.corsOrigins).toEqual([
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:8081',
        'http://localhost:19006',
      ]);
    });

    it('should parse CORS_ORIGINS as a trimmed comma-separated list', () => {
      process.env.NODE_ENV = 'production';
      process.env.CORS_ORIGINS =
        ' https://app.petcard.app , https://vet.petcard.app ,, ';

      const config = appConfig();

      expect(config.nodeEnv).toBe('production');
      expect(config.corsOrigins).toEqual([
        'https://app.petcard.app',
        'https://vet.petcard.app',
      ]);
    });

    it('should fall back to localhost origins when CORS_ORIGINS is blank outside production', () => {
      process.env.CORS_ORIGINS = '   ';

      const config = appConfig();

      expect(config.corsOrigins).toContain('http://localhost:5173');
    });

    it('should throw in production when CORS_ORIGINS is missing', () => {
      process.env.NODE_ENV = 'production';

      expect(() => appConfig()).toThrow(
        'CORS_ORIGINS is required in production',
      );
    });
  });

  describe('authConfig', () => {
    it('should default jwtExpiresIn to 7d', () => {
      process.env.JWT_SECRET = 'secret';

      expect(authConfig()).toEqual({
        jwtSecret: 'secret',
        jwtExpiresIn: '7d',
      });
    });

    it('should use JWT_EXPIRES_IN when set', () => {
      process.env.JWT_EXPIRES_IN = '1h';

      expect(authConfig().jwtExpiresIn).toBe('1h');
    });
  });

  describe('awsConfig', () => {
    it('should expose the AWS credentials from env', () => {
      process.env.AWS_REGION = 'us-east-1';
      process.env.AWS_ACCESS_KEY_ID = 'AKIA123';
      process.env.AWS_SECRET_ACCESS_KEY = 'secret';
      process.env.AWS_S3_BUCKET = 'petcard-uploads';

      expect(awsConfig()).toEqual({
        region: 'us-east-1',
        accessKeyId: 'AKIA123',
        secretAccessKey: 'secret',
        bucket: 'petcard-uploads',
      });
    });
  });

  describe('cardConfig', () => {
    it('should apply the public card defaults', () => {
      expect(cardConfig()).toEqual({
        publicBaseUrl: 'https://card.petcard.app/#/card',
        publicThrottleTtlSeconds: 60,
        publicThrottleLimit: 10,
      });
    });

    it('should read overrides from env and coerce numbers', () => {
      process.env.PUBLIC_CARD_BASE_URL = 'https://cards.example.com/#';
      process.env.PUBLIC_CARD_THROTTLE_TTL_SECONDS = '120';
      process.env.PUBLIC_CARD_THROTTLE_LIMIT = '5';

      expect(cardConfig()).toEqual({
        publicBaseUrl: 'https://cards.example.com/#',
        publicThrottleTtlSeconds: 120,
        publicThrottleLimit: 5,
      });
    });
  });

  describe('encryptionConfig', () => {
    it('should expose the encryption key from env', () => {
      process.env.ENCRYPTION_KEY = 'a'.repeat(64);

      expect(encryptionConfig().key).toBe('a'.repeat(64));
    });
  });

  describe('firebaseConfig', () => {
    it('should default to disabled without requiring credentials', () => {
      expect(firebaseConfig()).toEqual({
        enabled: false,
        projectId: undefined,
        clientEmail: undefined,
        privateKey: undefined,
      });
    });

    it('should treat FCM_ENABLED=false as disabled', () => {
      process.env.FCM_ENABLED = 'false';

      expect(firebaseConfig().enabled).toBe(false);
    });

    it('should enable and unescape the private key when credentials are set', () => {
      process.env.FCM_ENABLED = 'true';
      process.env.FIREBASE_PROJECT_ID = 'petcard';
      process.env.FIREBASE_CLIENT_EMAIL = 'sdk@petcard.iam.gserviceaccount.com';
      process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN\\nKEY-----';

      expect(firebaseConfig()).toEqual({
        enabled: true,
        projectId: 'petcard',
        clientEmail: 'sdk@petcard.iam.gserviceaccount.com',
        privateKey: '-----BEGIN\nKEY-----',
      });
    });

    it('should throw when enabled without complete credentials', () => {
      process.env.FCM_ENABLED = 'true';
      process.env.FIREBASE_PROJECT_ID = 'petcard';

      expect(() => firebaseConfig()).toThrow(
        'FCM_ENABLED=true requires FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY to be set.',
      );
    });
  });

  describe('googleCalendarConfig', () => {
    it('should default the redirect URI to localhost', () => {
      expect(googleCalendarConfig().redirectUri).toBe(
        'http://localhost:3000/calendar/callback',
      );
    });

    it('should read the OAuth client from env', () => {
      process.env.GOOGLE_CALENDAR_CLIENT_ID = 'client-id';
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'client-secret';
      process.env.GOOGLE_CALENDAR_REDIRECT_URI =
        'https://api.petcard.app/calendar/callback';

      expect(googleCalendarConfig()).toEqual({
        clientId: 'client-id',
        clientSecret: 'client-secret',
        redirectUri: 'https://api.petcard.app/calendar/callback',
      });
    });
  });

  describe('googleMapsConfig', () => {
    it('should expose the API key from env', () => {
      process.env.GOOGLE_MAPS_API_KEY = 'maps-key';

      expect(googleMapsConfig().apiKey).toBe('maps-key');
    });
  });

  describe('rabbitmqConfig', () => {
    it('should apply the local broker and queue defaults', () => {
      expect(rabbitmqConfig()).toEqual({
        url: 'amqp://petcard:petcard123@localhost:5672',
        qrCodeQueue: 'qr-code.generate',
        qrCodeDlq: 'qr-code.generate.dlq',
        notificationPushQueue: 'notification.push',
        notificationPushDlq: 'notification.push.dlq',
        calendarSyncQueue: 'calendar.sync',
        calendarSyncDlq: 'calendar.sync.dlq',
      });
    });

    it('should read every queue name and URL from env', () => {
      process.env.RABBITMQ_URL = 'amqp://user:pass@broker:5672';
      process.env.RABBITMQ_QR_CODE_QUEUE = 'qr.custom';
      process.env.RABBITMQ_QR_CODE_DLQ = 'qr.custom.dlq';
      process.env.RABBITMQ_NOTIFICATION_PUSH_QUEUE = 'push.custom';
      process.env.RABBITMQ_NOTIFICATION_PUSH_DLQ = 'push.custom.dlq';
      process.env.RABBITMQ_CALENDAR_SYNC_QUEUE = 'calendar.custom';
      process.env.RABBITMQ_CALENDAR_SYNC_DLQ = 'calendar.custom.dlq';

      expect(rabbitmqConfig()).toEqual({
        url: 'amqp://user:pass@broker:5672',
        qrCodeQueue: 'qr.custom',
        qrCodeDlq: 'qr.custom.dlq',
        notificationPushQueue: 'push.custom',
        notificationPushDlq: 'push.custom.dlq',
        calendarSyncQueue: 'calendar.custom',
        calendarSyncDlq: 'calendar.custom.dlq',
      });
    });
  });

  describe('reminderConfig', () => {
    it('should default to enabled with a 3-day window', () => {
      expect(reminderConfig()).toEqual({ enabled: true, windowDays: 3 });
    });

    it('should read the toggle and window from env', () => {
      process.env.DOSE_REMINDER_ENABLED = 'false';
      process.env.DOSE_REMINDER_WINDOW_DAYS = '7';

      expect(reminderConfig()).toEqual({ enabled: false, windowDays: 7 });
    });
  });
});
