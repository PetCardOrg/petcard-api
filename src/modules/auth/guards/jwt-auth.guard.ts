import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Autenticação JWT. Registrado como guard global (`APP_GUARD`), então toda rota
 * HTTP exige um Bearer token válido — salvo as marcadas com `@Public()`.
 *
 * Contextos não-HTTP (consumidores RabbitMQ via `@MessagePattern`) não carregam
 * JWT e são liberados: a autenticação de mensagens de fila é responsabilidade do
 * broker, não deste guard.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    if (context.getType() !== 'http') {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }
}
