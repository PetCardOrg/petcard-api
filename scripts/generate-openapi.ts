import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from '../src/app.module';

/**
 * Gera o documento OpenAPI da API sem subir o servidor nem conectar em
 * Postgres/RabbitMQ. Usa o `preview mode` do Nest, que monta o grafo de
 * módulos e lê os metadados do Swagger (mesmos decorators de PC-097) sem
 * instanciar providers nem rodar hooks de ciclo de vida.
 *
 * Uso: `npm run openapi:json` → escreve `openapi.json` na raiz do repo.
 * É a fonte de verdade da collection Postman (PC-098).
 */
async function generate(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    preview: true,
    logger: false,
  });

  const config = new DocumentBuilder()
    .setTitle('PetCard API')
    .setDescription(
      'API REST do PetCard — carteira digital de saúde para pets. ' +
        'Autenticação via JWT (Bearer). Endpoints de tutor, pet, prontuário ' +
        '(vacina/vermífugo/medicação), carteira digital/QR, clínicas, ' +
        'agendamento/Calendar, notificações e interface do veterinário.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  const outPath = resolve(process.cwd(), 'openapi.json');
  writeFileSync(outPath, JSON.stringify(document, null, 2));
  await app.close();

  const paths = Object.keys(document.paths ?? {}).length;
  const schemas = Object.keys(document.components?.schemas ?? {}).length;
  console.log(
    `OpenAPI gerado em ${outPath} — ${paths} paths, ${schemas} schemas`,
  );
}

void generate();
