import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtStrategy, JwtPayload } from '../strategies/jwt.strategy';

// Mock jwks-rsa para não fazer chamadas HTTP reais
jest.mock('jwks-rsa', () => ({
  passportJwtSecret: jest.fn().mockReturnValue(() => 'mock-secret'),
}));

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        'auth.domain': 'petcard-test.us.auth0.com',
        'auth.audience': 'https://api.petcard.com',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    it('should return the payload with sub, email, and permissions', () => {
      const payload: JwtPayload = {
        sub: 'auth0|abc123',
        email: 'vet@petcard.com',
        permissions: ['read:pets'],
      };

      const result = strategy.validate(payload);

      expect(result).toEqual({
        sub: 'auth0|abc123',
        email: 'vet@petcard.com',
        permissions: ['read:pets'],
      });
    });

    it('should handle payload with only sub', () => {
      const payload: JwtPayload = {
        sub: 'auth0|minimal',
      };

      const result = strategy.validate(payload);

      expect(result).toEqual({
        sub: 'auth0|minimal',
        email: undefined,
        permissions: undefined,
      });
    });
  });
});
