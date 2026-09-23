import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Tutor } from '@prisma/client';
import { UpdateTutorDto, normalizeEmail } from '@petcardorg/shared';
import { temVinculoComTutor } from '../../common/authorization/pet-atendido';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
  ) {}

  async findById(id: string): Promise<TutorPublico> {
    return semSenha(await this.buscarOuFalhar(id));
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

    if (!(await temVinculoComTutor(this.prisma, veterinarioId, id))) {
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

  /**
   * Atualiza o cadastro do tutor.
   *
   * Trocar o e-mail derruba a verificação junto, pelo mesmo motivo que trocar
   * o CRMV derruba a do veterinário: o endereço novo não foi confirmado por
   * ninguém. Sem isso, bastava verificar um endereço próprio e trocar depois
   * para o de outra pessoa para ficar "verificado" nele.
   */
  async updateById(id: string, data: UpdateTutorDto): Promise<TutorPublico> {
    const atual = await this.buscarOuFalhar(id);
    const email =
      data.email === undefined ? undefined : normalizeEmail(data.email);
    const trocouDeEmail = email !== undefined && email !== atual.email;

    if (trocouDeEmail) {
      await this.assertEmailDisponivel(email, id);
    }
    if (data.profile_image_url !== undefined) {
      this.uploadService.assertBucketUrl(data.profile_image_url);
    }

    const tutor = await this.prisma.tutor.update({
      where: { id },
      // Campos listados um a um: espalhar o DTO no `data` do Prisma deixa a
      // superfície de escrita a reboque do DTO, e um campo novo lá vira
      // gravação silenciosa aqui.
      data: {
        name: data.name,
        email,
        phone: data.phone,
        profileImageUrl: data.profile_image_url,
        ...(trocouDeEmail ? { emailVerifiedAt: null } : {}),
      },
    });
    return semSenha(tutor);
  }

  /**
   * O e-mail é unique no banco. Sem esta checagem, apontar para um endereço
   * já cadastrado estourava a constraint do Prisma e virava 500 — quando o
   * caso é uma colisão previsível, que o cliente precisa distinguir para
   * pedir outro endereço.
   */
  private async assertEmailDisponivel(
    email: string,
    excludeId: string,
  ): Promise<void> {
    const existente = await this.prisma.tutor.findUnique({ where: { email } });
    if (existente && existente.id !== excludeId) {
      throw new ConflictException('Email already registered');
    }
  }

  private async buscarOuFalhar(id: string): Promise<Tutor> {
    const tutor = await this.prisma.tutor.findUnique({ where: { id } });
    if (!tutor) {
      throw new NotFoundException(`Tutor with id ${id} not found`);
    }
    return tutor;
  }
}
