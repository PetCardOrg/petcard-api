import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth.service';
import { JwtPayload } from '../strategies/jwt.strategy';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUserFromPayload', () => {
    it('should return user data from a complete payload', () => {
      const payload: JwtPayload = {
        sub: 'auth0|123456',
        email: 'tutor@petcard.com',
        permissions: ['read:pets', 'write:pets'],
      };

      const result = service.getUserFromPayload(payload);

      expect(result).toEqual({
        sub: 'auth0|123456',
        email: 'tutor@petcard.com',
        permissions: ['read:pets', 'write:pets'],
      });
    });

    it('should handle payload without optional fields', () => {
      const payload: JwtPayload = {
        sub: 'auth0|789',
      };

      const result = service.getUserFromPayload(payload);

      expect(result).toEqual({
        sub: 'auth0|789',
        email: undefined,
        permissions: undefined,
      });
    });
  });
});
