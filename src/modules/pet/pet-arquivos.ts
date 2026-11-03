import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';

/**
 * Tudo o que um pet guarda no bucket: a foto, os PNGs de QR da carteira e da
 * coleira e os anexos clínicos (privados).
 *
 * Carteira, coleira e anexos saem em cascata com o pet, então quem exclui o
 * pet ou o tutor lê isto antes do delete e descarta depois (AUD API-10,
 * API-26).
 */
const ARQUIVOS_DO_PET = {
  photoUrl: true,
  carteiraDigital: { select: { qrCodeUrl: true } },
  tagColeira: { select: { qrCodeUrl: true } },
  anexosClinicos: { select: { s3Key: true } },
} satisfies Prisma.PetSelect;

export type ArquivosDoPet = Prisma.PetGetPayload<{
  select: typeof ARQUIVOS_DO_PET;
}>;

export function lerArquivosDosPets(
  prisma: PrismaService,
  where: Prisma.PetWhereInput,
): Promise<ArquivosDoPet[]> {
  return prisma.pet.findMany({ where, select: ARQUIVOS_DO_PET });
}

/** Por melhor esforço: a exclusão já foi gravada quando isto roda. */
export async function descartarArquivosDosPets(
  upload: UploadService,
  pets: ArquivosDoPet[],
): Promise<void> {
  await Promise.all(
    pets.flatMap((pet) => [
      ...[
        pet.photoUrl,
        pet.carteiraDigital?.qrCodeUrl,
        pet.tagColeira?.qrCodeUrl,
      ].map((url) => upload.discardFile(url)),
      ...pet.anexosClinicos.map((anexo) => upload.discardPrivate(anexo.s3Key)),
    ]),
  );
}
