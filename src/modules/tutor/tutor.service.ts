import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Tutor } from '@prisma/client';
import { UpdateTutorDto } from '@petcardorg/shared';
import { PrismaService } from '../../prisma/prisma.service';

/** Tutor sem o hash da senha — o que pode sair da API. */
export type TutorPublico = Omit<Tutor, 'password'>;

/**
 * O hash da senha nunca acompanha o tutor para fora do serviço.
 *
 * `findUnique` devolve a linha inteira, e as rotas devolviam esse objeto
 * direto: o hash bcrypt do tutor saía em `GET /tutors/me`, `PATCH /tutors/me`
 * e `GET /tutors/:id` — este último legível por qualquer veterinário logado,
 * o que dava a ele material para quebra offline de senha.
 */
function semSenha(tutor: Tutor): TutorPublico {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, ...rest } = tutor;
  return rest;
}

@Injectable()
export class TutorService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<TutorPublico> {
    const tutor = await this.prisma.tutor.findUnique({ where: { id } });
    if (!tutor) {
      throw new NotFoundException(`Tutor with id ${id} not found`);
    }
    return semSenha(tutor);
  }

  /**
   * Tutor visto pelo veterinário, restrito a quem ele de fato atende.
   *
   * Sem o recorte, o papel VET lia o cadastro (nome, e-mail, telefone) de
   * qualquer tutor da base a partir do id. O vínculo com algum pet do tutor —
   * criado na leitura do QR Code — é o que autoriza a consulta.
   */
  async findByIdForVet(
    id: string,
    veterinarioId: string,
  ): Promise<TutorPublico> {
    const tutor = await this.findById(id);

    const vinculo = await this.prisma.petAtendido.findFirst({
      where: { veterinarioId, pet: { tutorId: id } },
      select: { id: true },
    });
    if (!vinculo) {
      throw new ForbiddenException(
        'Tutor sem pet na sua lista de atendidos. Leia o QR Code da carteira para iniciar o atendimento.',
      );
    }

    return tutor;
  }

  async findByEmail(email: string): Promise<Tutor | null> {
    return this.prisma.tutor.findUnique({ where: { email } });
  }

  async updateById(id: string, data: UpdateTutorDto): Promise<TutorPublico> {
    await this.findById(id);
    const tutor = await this.prisma.tutor.update({
      where: { id },
      // Campos listados um a um: espalhar o DTO no `data` do Prisma deixa a
      // superfície de escrita a reboque do DTO, e um campo novo lá vira
      // gravação silenciosa aqui.
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        profileImageUrl: data.profile_image_url,
      },
    });
    return semSenha(tutor);
  }
}
