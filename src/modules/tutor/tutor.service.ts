import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Tutor } from '@prisma/client';
import { UpdateTutorDto } from '@petcardorg/shared';
import { PrismaService } from '../../prisma/prisma.service';

/** Tutor sem o hash da senha — o que pode sair da API. */
export type TutorPublico = Omit<
  Tutor,
  'password' | 'profileImageUrl' | 'googleId' | 'emailVerifiedAt'
> & {
  profile_image_url: string | null;
  /** Deriva de `emailVerifiedAt` — o app usa isto no aviso de verificação. */
  email_verified: boolean;
};

/**
 * O hash da senha nunca acompanha o tutor para fora do serviço.
 *
 * `findUnique` devolve a linha inteira, e as rotas devolviam esse objeto
 * direto: o hash bcrypt do tutor saía em `GET /tutors/me`, `PATCH /tutors/me`
 * e `GET /tutors/:id` — este último legível por qualquer veterinário logado,
 * o que dava a ele material para quebra offline de senha.
 *
 * `profileImageUrl` também precisa virar `profile_image_url` aqui: é o nome
 * da coluna (`@map`), não do campo no Prisma Client, e `TutorResponseDto` no
 * shared contrata a resposta em snake_case. Sem a troca, o tutor.service do
 * mobile lia `undefined` e a foto de perfil salva nunca aparecia de volta.
 */
function semSenha(tutor: Tutor): TutorPublico {
  const {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    password,
    profileImageUrl,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    googleId,
    emailVerifiedAt,
    ...rest
  } = tutor;
  return {
    ...rest,
    profile_image_url: profileImageUrl,
    email_verified: emailVerifiedAt !== null,
  };
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

  /**
   * Apaga a conta do tutor e tudo que pende dela.
   *
   * O cascata leva pets, prontuário, carteira, agendamentos e notificações —
   * inclusive a trilha de ações clínicas dos pets dele, que é a consequência
   * de "exclusão definitiva" pedida por quem apaga a conta. A trilha das ações
   * que um veterinário registrou em pets de OUTROS tutores não é afetada:
   * nome e CRMV do autor são copiados na gravação, não referenciados.
   */
  async removeById(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.tutor.delete({ where: { id } });
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
