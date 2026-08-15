import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { CrmvVerificationService } from './crmv-verification.service';

/**
 * Libera apenas veterinários com CRMV verificado e dentro do prazo (api#113).
 *
 * Usar **depois** de `@Auth(Role.VET)`: assume que a autenticação e o papel já
 * foram checados pelos guards globais.
 */
@Injectable()
export class CrmvVerifiedGuard implements CanActivate {
  constructor(private readonly crmvVerification: CrmvVerificationService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as JwtPayload | undefined;

    if (!user?.sub) {
      throw new ForbiddenException('Autenticação de veterinário necessária.');
    }

    // Um token pode trazer role VET sem que o sub seja um veterinário — os
    // logins de tutor e de veterinário leem tabelas diferentes. Aqui isso é
    // recusa de acesso, não "registro não encontrado".
    const status = await this.crmvVerification
      .getStatus(user.sub)
      .catch(() => ({ verified: false }));

    if (!status.verified) {
      throw new ForbiddenException(
        'Seu CRMV precisa estar verificado para acessar dados clínicos. ' +
          'Verifique em POST /veterinarios/me/crmv/verificar.',
      );
    }

    return true;
  }
}
