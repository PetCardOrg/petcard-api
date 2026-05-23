import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtStrategy, JwtPayload } from '../strategies/jwt.strategy';
import { Role } from '../enums/role.enum';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        'auth.jwtSecret': 'test-secret',
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
    it('should return the payload with sub, email, and role', () => {
      const payload: JwtPayload = {
        sub: 'tutor-uuid-123',
        email: 'vet@petcard.com',
        role: Role.VET,
      };

      const result = strategy.validate(payload);

      expect(result).toEqual({
        sub: 'tutor-uuid-123',
        email: 'vet@petcard.com',
        role: Role.VET,
      });
    });

    it('should handle payload with only sub', () => {
      const payload: JwtPayload = {
        sub: 'tutor-uuid-456',
      };

      const result = strategy.validate(payload);

      expect(result).toEqual({
        sub: 'tutor-uuid-456',
        email: undefined,
        role: undefined,
      });
    });
  });
});
