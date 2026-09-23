import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY, Roles } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';
import { RolesGuard } from '../guards/roles.guard';
import { JwtPayload } from '../strategies/jwt.strategy';

const createContext = (
  user: JwtPayload | undefined,
  type: 'http' | 'rpc' = 'http',
): ExecutionContext => {
  return {
    getType: () => type,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
};

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  /** Configura o reflector para responder por chave de metadado (public / roles). */
  const withMetadata = (opts: {
    isPublic?: boolean;
    roles?: Role[] | undefined;
  }): void => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: unknown) => {
        if (key === IS_PUBLIC_KEY) return opts.isPublic ?? false;
        if (key === ROLES_KEY) return opts.roles;
        return undefined;
      });
  };

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow non-http contexts (ex.: consumidores RMQ)', () => {
    // Nem sequer lê metadados — fila não passa por RBAC de papéis.
    const spy = jest.spyOn(reflector, 'getAllAndOverride');
    const ctx = createContext(undefined, 'rpc');

    expect(guard.canActivate(ctx)).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('should allow public routes', () => {
    withMetadata({ isPublic: true, roles: [Role.VET] });
    const ctx = createContext(undefined);

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow access when no roles are required', () => {
    withMetadata({ roles: undefined });
    const ctx = createContext({ sub: 'tutor-1' });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow access when required roles array is empty', () => {
    withMetadata({ roles: [] });
    const ctx = createContext({ sub: 'tutor-1' });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow access when user has one of the required roles', () => {
    withMetadata({ roles: [Role.TUTOR, Role.VET] });
    const ctx = createContext({ sub: 'tutor-1', role: Role.TUTOR });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should deny access when user has a different role', () => {
    withMetadata({ roles: [Role.VET] });
    const ctx = createContext({ sub: 'tutor-1', role: Role.TUTOR });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should deny access when user has no role', () => {
    withMetadata({ roles: [Role.TUTOR] });
    const ctx = createContext({ sub: 'tutor-1' });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should deny access when request has no user', () => {
    withMetadata({ roles: [Role.TUTOR] });
    const ctx = createContext(undefined);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});

describe('Roles decorator', () => {
  it('should set roles metadata on the handler', () => {
    class TestController {
      @Roles(Role.TUTOR, Role.VET)
      handler(this: void): void {}
    }

    const roles = Reflect.getMetadata(
      ROLES_KEY,
      TestController.prototype.handler,
    ) as Role[];

    expect(roles).toEqual([Role.TUTOR, Role.VET]);
  });
});
