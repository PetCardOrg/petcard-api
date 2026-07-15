import {
  ExecutionContext,
  INestApplication,
  Provider,
  Type,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { JwtAuthGuard } from '../../src/modules/auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../src/modules/auth/strategies/jwt.strategy';
import { Role } from '../../src/modules/auth/enums/role.enum';

export type TestUser = Pick<JwtPayload, 'sub' | 'email' | 'role'>;

export const TUTOR: TestUser = {
  sub: 'tutor-1',
  email: 'tutor@petcard.com',
  role: Role.TUTOR,
};

export const VET: TestUser = {
  sub: 'vet-1',
  email: 'vet@petcard.com',
  role: Role.VET,
};

export interface ControllerHarness {
  app: INestApplication<App>;
  /** Define quem é o usuário autenticado da próxima request (ou null = 401). */
  setUser: (user: TestUser | null) => void;
}

/**
 * Sobe um app Nest real (roteamento + ValidationPipe global + guards) com apenas
 * o(s) controller(s) e providers fornecidos. O `JwtAuthGuard` é substituído para
 * injetar `req.user`; o `RolesGuard` permanece real, então o RBAC de `@Auth`/
 * `@Roles` é exercitado de verdade. Prisma e clientes externos devem entrar em
 * `providers` como mocks.
 */
export async function createControllerTestApp(opts: {
  controllers: Type<unknown>[];
  providers: Provider[];
}): Promise<ControllerHarness> {
  let currentUser: TestUser | null = TUTOR;

  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: opts.controllers,
    providers: opts.providers,
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({
      canActivate: (context: ExecutionContext) => {
        if (!currentUser) {
          throw new UnauthorizedException();
        }
        const req = context.switchToHttp().getRequest<{ user?: TestUser }>();
        req.user = currentUser;
        return true;
      },
    })
    .compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  return {
    app,
    setUser: (user) => {
      currentUser = user;
    },
  };
}
