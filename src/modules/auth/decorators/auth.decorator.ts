import { applyDecorators, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Role } from '../enums/role.enum';
import { Roles } from './roles.decorator';

export const Auth = (...roles: Role[]): ReturnType<typeof applyDecorators> =>
  applyDecorators(Roles(...roles), UseGuards(JwtAuthGuard, RolesGuard));
