import { PrismaService } from '../../prisma/prisma.service';

/**
 * Confere se o veterinário tem o pet (ou algum pet do tutor) na lista de
 * atendidos — vínculo `PetAtendido` criado pela leitura do QR Code da
 * carteira. Sem isso, o papel VET sozinho abriria o prontuário/cadastro de
 * qualquer pet ou tutor cujo id fosse conhecido.
 *
 * Fica só com a checagem: cada chamador decide a mensagem e se o caso é 403
 * ou 404 (a escolha varia por rota, de propósito — ver os comentários em
 * `PetService.assertAccess`, `VetNoteService` e `TutorService.findByIdForVet`).
 */
export async function temVinculoComPet(
  prisma: PrismaService,
  veterinarioId: string,
  petId: string,
): Promise<boolean> {
  const vinculo = await prisma.petAtendido.findUnique({
    where: { veterinarioId_petId: { veterinarioId, petId } },
  });
  return vinculo !== null;
}

export async function temVinculoComTutor(
  prisma: PrismaService,
  veterinarioId: string,
  tutorId: string,
): Promise<boolean> {
  const vinculo = await prisma.petAtendido.findFirst({
    where: { veterinarioId, pet: { tutorId } },
    select: { id: true },
  });
  return vinculo !== null;
}
