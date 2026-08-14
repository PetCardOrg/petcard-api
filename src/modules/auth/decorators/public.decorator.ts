import { SetMetadata } from '@nestjs/common';

/**
 * Marca uma rota como pública, dispensando autenticação.
 *
 * Com os guards globais (`JwtAuthGuard` + `RolesGuard` via `APP_GUARD`), toda
 * rota exige login por padrão. `@Public()` é a exceção explícita — usada apenas
 * em endpoints sem dono autenticado (login/registro, callback de OAuth, carteira
 * pública por token, health check).
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(IS_PUBLIC_KEY, true);
