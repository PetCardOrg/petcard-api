import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import type { App } from 'supertest/types';
import request from 'supertest';
import { authConfig } from '../../../config/auth.config';
import { ConfigModule } from '@nestjs/config';
import { Auth } from '../decorators/auth.decorator';
import { Public } from '../decorators/public.decorator';
import { Role } from '../enums/role.enum';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { JwtStrategy } from '../strategies/jwt.strategy';

const SECRET = 'secure-by-default-spec-secret';

/**
 * Controller "cobaia": exercita as três situações que comprovam o
 * secure-by-default garantido pelos guards globais (JwtAuthGuard + RolesGuard
 * via APP_GUARD).
 */
@Controller('secure-test')
class SecureTestController {
  // Sem @Auth e sem @Public: deve exigir autenticação POR PADRÃO.
  @Get('undecorated')
  undecorated(): { ok: boolean } {
    return { ok: true };
  }

  @Get('public')
  @Public()
  publicRoute(): { ok: boolean } {
    return { ok: true };
  }

  @Get('vet-only')
  @Auth(Role.VET)
  vetOnly(): { ok: boolean } {
    return { ok: true };
  }
}

describe('RBAC secure-by-default (guards globais)', () => {
  let app: INestApplication<App>;
  let tutorToken: string;
  let vetToken: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = SECRET;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [authConfig] }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: SECRET }),
      ],
      controllers: [SecureTestController],
      providers: [
        JwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication<INestApplication<App>>();
    await app.init();

    const jwt = app.get(JwtService);
    tutorToken = jwt.sign({ sub: 'tutor-1', role: Role.TUTOR });
    vetToken = jwt.sign({ sub: 'vet-1', role: Role.VET });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('rota sem decorator (nasce protegida)', () => {
    it('rejeita sem token (401)', async () => {
      await request(app.getHttpServer())
        .get('/secure-test/undecorated')
        .expect(401);
    });

    it('aceita qualquer usuário autenticado (200)', async () => {
      await request(app.getHttpServer())
        .get('/secure-test/undecorated')
        .set('Authorization', `Bearer ${tutorToken}`)
        .expect(200);
    });
  });

  describe('rota @Public', () => {
    it('permite acesso sem token (200)', async () => {
      await request(app.getHttpServer()).get('/secure-test/public').expect(200);
    });
  });

  describe('rota @Auth(VET) (diferenciação por papel)', () => {
    it('rejeita sem token (401)', async () => {
      await request(app.getHttpServer())
        .get('/secure-test/vet-only')
        .expect(401);
    });

    it('proíbe o TUTOR (403)', async () => {
      await request(app.getHttpServer())
        .get('/secure-test/vet-only')
        .set('Authorization', `Bearer ${tutorToken}`)
        .expect(403);
    });

    it('permite o VET (200)', async () => {
      await request(app.getHttpServer())
        .get('/secure-test/vet-only')
        .set('Authorization', `Bearer ${vetToken}`)
        .expect(200);
    });
  });
});
