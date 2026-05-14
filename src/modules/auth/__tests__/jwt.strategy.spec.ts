import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtStrategy, JwtPayload } from '../strategies/jwt.strategy';
import { Role } from '../enums/role.enum';
import { TutorService } from '../../tutor/tutor.service';

// Mock jwks-rsa para não fazer chamadas HTTP reais
jest.mock('jwks-rsa', () => ({
  passportJwtSecret: jest.fn().mockReturnValue(() => 'mock-secret'),
}));

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let tutorService: { findOrCreate: jest.Mock };

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
    tutorService = {
      findOrCreate: jest.fn().mockResolvedValue({ role: Role.TUTOR }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: TutorService, useValue: tutorService },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    it('should return the payload with sub, email, and role from the database', async () => {
      tutorService.findOrCreate.mockResolvedValueOnce({ role: Role.VET });
      const payload: JwtPayload = {
        sub: 'auth0|abc123',
        email: 'vet@petcard.com',
      };

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        sub: 'auth0|abc123',
        email: 'vet@petcard.com',
        role: Role.VET,
      });
      expect(tutorService.findOrCreate).toHaveBeenCalledWith(
        'auth0|abc123',
        'vet@petcard.com',
        'vet',
      );
    });

    it('should handle payload with only sub (no email, no role)', async () => {
      const payload: JwtPayload = {
        sub: 'auth0|minimal',
      };

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        sub: 'auth0|minimal',
        email: undefined,
        role: undefined,
      });
      expect(tutorService.findOrCreate).not.toHaveBeenCalled();
    });
  });
});
