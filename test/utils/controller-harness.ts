import {
  ExecutionContext,
  INestApplication,
  Provider,
  Type,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import type { App } from 'supertest/types';
import { IS_PUBLIC_KEY } from '../../src/modules/auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/modules/auth/guards/roles.guard';
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
 * Reproduz o `JwtAuthGuard` real (checa `@Public()`, senão exige usuário) sem
 * autenticar de verdade via passport — a estratégia 'jwt' não está registrada
 * neste módulo de teste.
 */
function buildFakeJwtAuthGuard(
  reflector: Reflector,
  getCurrentUser: () => TestUser | null,
): { canActivate: (context: ExecutionContext) => boolean } {
  return {
    canActivate: (context: ExecutionContext) => {
      if (context.getType() !== 'http') {
        return true;
      }
      const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (isPublic) {
        return true;
      }
      const user = getCurrentUser();
      if (!user) {
        throw new UnauthorizedException();
      }
      const req = context.switchToHttp().getRequest<{ user?: TestUser }>();
      req.user = user;
      return true;
    },
  };
}

/**
 * Sobe um app Nest real (roteamento + ValidationPipe global + guards) com apenas
 * o(s) controller(s) e providers fornecidos. O `JwtAuthGuard` é substituído para
 * injetar `req.user`; o `RolesGuard` permanece real, então o RBAC de `@Auth`/
 * `@Roles` é exercitado de verdade. Prisma e clientes externos devem entrar em
 * `providers` como mocks.
 *
 * Os guards também entram como `APP_GUARD` (como em produção, ver
 * `AuthModule`), não só via `@Auth()`/`@AuthCrmvVerificado()` de cada rota —
 * senão uma rota nova sem decorator nenhum passa sem guard nesta suíte e só
 * ficaria protegida em produção pela proteção-por-omissão real. O provider
 * global usa a mesma fábrica do `overrideGuard`, e não a classe `JwtAuthGuard`
 * em si: registrar `{ provide: APP_GUARD, useClass: JwtAuthGuard }` cria uma
 * instância própria que o `overrideGuard` (escopado ao uso via `@UseGuards()`
 * nos decorators) não alcança, e ela tenta autenticar pela estratégia 'jwt'
 * de verdade — inexistente aqui.
 */
export async function createControllerTestApp(opts: {
  controllers: Type<unknown>[];
  providers: Provider[];
}): Promise<ControllerHarness> {
  let currentUser: TestUser | null = TUTOR;

  const moduleRef: TestingModule = await Test.createTestingModule({
    // Os limites reais entram em produção pelo AppModule. Aqui os nomes
    // precisam existir para o ThrottlerGuard resolver, com teto alto para o
    // rate limit não reprovar suíte nenhuma.
    imports: [
      ThrottlerModule.forRoot({
        throttlers: [
          { name: 'auth', ttl: 60_000, limit: 10_000 },
          { name: 'public-card', ttl: 60_000, limit: 10_000 },
          { name: 'places', ttl: 60_000, limit: 10_000 },
          { name: 'clinica-photo', ttl: 60_000, limit: 10_000 },
        ],
      }),
    ],
    controllers: opts.controllers,
    providers: [
      ...opts.providers,
      {
        provide: APP_GUARD,
        useFactory: (reflector: Reflector) =>
          buildFakeJwtAuthGuard(reflector, () => currentUser),
        inject: [Reflector],
      },
      { provide: APP_GUARD, useClass: RolesGuard },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useFactory({
      factory: (reflector: Reflector) =>
        buildFakeJwtAuthGuard(reflector, () => currentUser),
      inject: [Reflector],
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
