import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
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
  let prisma: { tutor: { findUnique: jest.Mock } };

  beforeEach(() => {
    reflector = new Reflector();
    prisma = { tutor: { findUnique: jest.fn() } };
    guard = new RolesGuard(reflector, prisma as unknown as PrismaService);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow access when no roles are required', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = createContext({ sub: 'auth0|1' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('should allow access when required roles array is empty', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    const ctx = createContext({ sub: 'auth0|1' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('should allow access when user has one of the required roles', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.TUTOR, Role.VET]);
    prisma.tutor.findUnique.mockResolvedValue({ role: Role.TUTOR });
    const ctx = createContext({ sub: 'auth0|1' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('should deny access when user has a different role', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.VET]);
    prisma.tutor.findUnique.mockResolvedValue({ role: Role.TUTOR });
    const ctx = createContext({ sub: 'auth0|1' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('should deny access when user is not found in database', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.TUTOR]);
    prisma.tutor.findUnique.mockResolvedValue(null);
    const ctx = createContext({ sub: 'auth0|1' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('should deny access when request has no user', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.TUTOR]);
    const ctx = createContext(undefined);

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
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
