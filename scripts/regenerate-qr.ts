import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { QrCodePublisher } from '../src/modules/queue/qr-code.publisher';

/**
 * Reenfileira a geração dos QRs (carteira e coleira) de pets já existentes.
 *
 * O QR é gerado uma única vez, no cadastro do pet, e a imagem fica no S3 com a
 * URL daquele momento embutida. Trocar `PUBLIC_CARD_BASE_URL` /
 * `PUBLIC_COLLAR_BASE_URL` — ao apontar para um túnel para testar pelo celular,
 * por exemplo — não regenera nada: o PNG antigo continua apontando para o
 * endereço velho. Daí este script.
 *
 * ⚠️ O token é ROTACIONADO a cada geração (`issueTokenForPet` faz
 * `update: { token }`), então o QR anterior deixa de funcionar. Em produção
 * isso invalidaria coleiras já impressas — use com consciência.
 *
 * Uso: `npm run qr:regenerate -- --pet=<id>`
 *      `npm run qr:regenerate -- --all`
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const petArg = args.find((a) => a.startsWith('--pet='))?.split('=')[1];
  const todos = args.includes('--all');

  if (!petArg && !todos) {
    console.error('Informe --pet=<id> ou --all.');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const prisma = app.get(PrismaService);
  const publisher = app.get(QrCodePublisher);

  const pets = petArg
    ? await prisma.pet.findMany({
        where: { id: petArg },
        select: { id: true, name: true },
      })
    : await prisma.pet.findMany({ select: { id: true, name: true } });

  if (pets.length === 0) {
    console.error(petArg ? `Pet ${petArg} não encontrado.` : 'Nenhum pet.');
    await app.close();
    process.exit(1);
  }

  for (const pet of pets) {
    await publisher.publishGenerate(pet.id);
    console.log(`enfileirado: ${pet.name} (${pet.id})`);
  }

  console.log(
    `\n${pets.length} pet(s) na fila. O consumer gera e sobe para o S3 — ` +
      'a API precisa estar rodando para consumir. Os tokens anteriores foram invalidados.',
  );

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
