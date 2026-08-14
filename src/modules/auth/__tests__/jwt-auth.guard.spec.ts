import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, Public } from '../decorators/public.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

const createContext = (type: 'http' | 'rpc' = 'http'): ExecutionContext => {
  return {
    getType: () => type,
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
};

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;
  // prototype do mixin AuthGuard('jwt'), onde vive o canActivate do passport.
  const superProto = Object.getPrototypeOf(JwtAuthGuard.prototype) as {
    canActivate: (ctx: ExecutionContext) => boolean;
  };

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow non-http contexts sem autenticar (ex.: RMQ)', () => {
    const superSpy = jest.spyOn(superProto, 'canActivate');
    const ctx = createContext('rpc');

    expect(guard.canActivate(ctx)).toBe(true);
    expect(superSpy).not.toHaveBeenCalled();
  });

  it('should allow @Public routes sem autenticar', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const superSpy = jest.spyOn(superProto, 'canActivate');
    const ctx = createContext('http');

    expect(guard.canActivate(ctx)).toBe(true);
    expect(superSpy).not.toHaveBeenCalled();
  });

  it('should delegate to passport (super) em rotas protegidas', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const superSpy = jest
      .spyOn(superProto, 'canActivate')
      .mockReturnValue(true);
    const ctx = createContext('http');

    expect(guard.canActivate(ctx)).toBe(true);
    expect(superSpy).toHaveBeenCalledWith(ctx);
  });
});

describe('Public decorator', () => {
  it('should set the public metadata flag on the handler', () => {
    class TestController {
      @Public()
      handler(this: void): void {}
    }

    const isPublic = Reflect.getMetadata(
      IS_PUBLIC_KEY,
      TestController.prototype.handler,
    ) as boolean;

    expect(isPublic).toBe(true);
  });
});
