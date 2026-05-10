import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { passportJwtSecret } from 'jwks-rsa';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { TutorService } from '../../tutor/tutor.service';

export interface JwtPayload {
  sub: string;
  email?: string;
  permissions?: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @Inject(forwardRef(() => TutorService))
    private readonly tutorService: TutorService,
  ) {
    const domain = configService.get<string>('auth.domain');
    const audience = configService.get<string>('auth.audience');

    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${domain}/.well-known/jwks.json`,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      audience,
      issuer: `https://${domain}/`,
      algorithms: ['RS256'],
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (payload.sub && payload.email) {
      await this.tutorService.findOrCreate(
        payload.sub,
        payload.email,
        payload.email.split('@')[0],
      );
    }

    return {
      sub: payload.sub,
      email: payload.email,
      permissions: payload.permissions,
    };
  }
}
