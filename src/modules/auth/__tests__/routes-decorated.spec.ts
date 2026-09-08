import { PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../app.module';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Varre TODOS os controllers registrados na aplicação e falha se algum
 * handler HTTP não carregar `@Public()` nem `@Auth()`/`@AuthCrmvVerificado()`
 * (que também setam `ROLES_KEY`, mesmo sem papel algum).
 *
 * `controller-harness.spec` (secure-by-default) prova o invariante num
 * controller sintético; este teste garante que cada rota REAL segue a regra —
 * foi a ausência disso que deixou `GET/DELETE /clinical-notes/:id` (api#113)
 * sem `@AuthCrmvVerificado` passar despercebida.
 *
 * Usa `preview: true` (mesma técnica do `openapi:json`) para montar o grafo
 * de módulos sem conectar Postgres/RabbitMQ.
 */
describe('todas as rotas HTTP carregam @Public() ou @Auth()/@AuthCrmvVerificado()', () => {
  it('não deixa handler sem decorator de acesso', async () => {
    const app = await NestFactory.create(AppModule, {
      preview: true,
      logger: false,
    });
    const modulesContainer = app.get(ModulesContainer);

    const undecorated: string[] = [];

    for (const module of modulesContainer.values()) {
      for (const wrapper of module.controllers.values()) {
        const controllerClass = wrapper.metatype as
          | (new (...args: unknown[]) => object)
          | undefined;
        if (!controllerClass) {
          continue;
        }

        const prototype = controllerClass.prototype as Record<string, unknown>;
        const methodNames = Object.getOwnPropertyNames(prototype).filter(
          (name) =>
            name !== 'constructor' && typeof prototype[name] === 'function',
        );

        for (const methodName of methodNames) {
          const handler = prototype[methodName] as (
            ...args: unknown[]
          ) => unknown;

          // Só interessam handlers de rota HTTP de fato (têm @Get/@Post/...).
          const isRouteHandler = Reflect.hasMetadata(PATH_METADATA, handler);
          if (!isRouteHandler) {
            continue;
          }

          const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, handler) as
            | boolean
            | undefined;
          const hasRolesMetadata =
            Reflect.hasMetadata(ROLES_KEY, handler) ||
            Reflect.hasMetadata(ROLES_KEY, controllerClass);

          if (!isPublic && !hasRolesMetadata) {
            undecorated.push(`${controllerClass.name}.${methodName}`);
          }
        }
      }
    }

    await app.close();

    expect(undecorated).toEqual([]);
  });
});
