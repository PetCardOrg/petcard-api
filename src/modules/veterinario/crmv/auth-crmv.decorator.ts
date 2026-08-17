import { applyDecorators, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '../../auth/enums/role.enum';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { CrmvVerifiedGuard } from './crmv-verified.guard';

/**
 * Como `@Auth()`, porém exigindo CRMV verificado de quem entra como
 * veterinário (api#113). Papéis não-VET passam sem essa exigência — rotas
 * compartilhadas com o tutor seguem funcionando.
 *
 * Os guards vêm num único `UseGuards` para fixar a ordem: autenticar, conferir
 * o papel e só então checar o CRMV. Somar um `@UseGuards` separado a `@Auth()`
 * inverteria essa ordem e o guard rodaria antes de haver usuário na requisição.
 */
export const AuthCrmvVerificado = (
  ...roles: Role[]
): ReturnType<typeof applyDecorators> =>
  applyDecorators(
    Roles(...roles),
    UseGuards(JwtAuthGuard, RolesGuard, CrmvVerifiedGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Token ausente ou inválido' }),
    ApiForbiddenResponse({
      description: 'CRMV não verificado, ou papel sem permissão',
    }),
  );
