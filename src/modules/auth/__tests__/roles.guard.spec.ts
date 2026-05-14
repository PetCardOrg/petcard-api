import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, Roles } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';
import { RolesGuard } from '../guards/roles.guard';
import { JwtPayload } from '../strategies/jwt.strategy';

const createContext = (user: JwtPayload | undefined): ExecutionContext => {
  return {
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

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow access when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = createContext({ sub: 'auth0|1' });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow access when required roles array is empty', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    const ctx = createContext({ sub: 'auth0|1' });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow access when user has one of the required roles', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.TUTOR, Role.VET]);
    const ctx = createContext({ sub: 'auth0|1', role: Role.TUTOR });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should deny access when user has a different role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.VET]);
    const ctx = createContext({ sub: 'auth0|1', role: Role.TUTOR });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should deny access when user has no role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.TUTOR]);
    const ctx = createContext({ sub: 'auth0|1' });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should deny access when request has no user', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.TUTOR]);
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
