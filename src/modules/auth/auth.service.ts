import { Injectable } from '@nestjs/common';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  getUserFromPayload(payload: JwtPayload): JwtPayload {
    return {
      sub: payload.sub,
      email: payload.email,
      permissions: payload.permissions,
    };
  }
}
