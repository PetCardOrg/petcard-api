import { applyDecorators, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Role } from '../enums/role.enum';
import { Roles } from './roles.decorator';

export const Auth = (...roles: Role[]): ReturnType<typeof applyDecorators> =>
  applyDecorators(
    Roles(...roles),
    UseGuards(JwtAuthGuard, RolesGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Token ausente ou inválido' }),
    ApiForbiddenResponse({
      description: roles.length
        ? `Requer papel ${roles.join(' ou ')}`
        : 'Papel sem permissão para este recurso',
    }),
  );
