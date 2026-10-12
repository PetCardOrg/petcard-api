import { createHash, randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AcaoClinicaTipo,
  AnexoClinico,
  EntidadeClinica,
  Prisma,
  Role,
} from '@prisma/client';
import {
  AnexoArquivoResponseDto,
  AnexoResponseDto,
  CreateAnexoDto,
} from '@petcardorg/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { assertPodeRemover } from '../health/autoria-clinica';
import { AcaoClinicaService } from '../historico/acao-clinica.service';
import { PetService } from '../pet/pet.service';
import { UploadService } from '../upload/upload.service';
import {
  ANEXO_LINK_VALIDADE_SEGUNDOS,
  ANEXO_MAX_POR_REGISTRO,
  nomeDeExibicao,
  validarArquivo,
} from './anexo-arquivo';
import { alvoDoAnexo, toAnexoResponseDto } from './anexo.mapper';

interface Autor {
  id: string;
  isVet: boolean;
}

/** Coluna de FK do anexo para cada tipo de registro. */
type ChaveDoRegistro =
  | 'vaccineRecordId'
  | 'dewormingRecordId'
  | 'medicationRecordId';

/**
 * Comprovantes de vacina, vermífugo e medicação.
 *
 * Três regras sustentam o módulo:
 *  - O arquivo é privado: só a chave fica no banco e a leitura é por link
 *    temporário, gerado depois de conferir o acesso ao pet.
 *  - Nada é apagado. Remover tira o anexo da visualização; linha e objeto
 *    permanecem, e a ação fica na trilha clínica (api#117).
 *  - "Verificado" é um atestado de veterinário com CRMV verificado. Anexo
 *    enviado por veterinário já nasce verificado; o do tutor espera a conferência.
 */
@Injectable()
export class AnexoService {
  private readonly logger = new Logger(AnexoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly petService: PetService,
    private readonly acoes: AcaoClinicaService,
    private readonly upload: UploadService,
  ) {}

  async criar(
    petId: string,
    autor: Autor,
    dto: CreateAnexoDto,
    file: Express.Multer.File | undefined,
  ): Promise<AnexoResponseDto> {
    await this.petService.assertAccess(petId, autor.id, autor.isVet);
    const extensao = validarArquivo(file);
    const arquivo = file as Express.Multer.File;

    const { chave, entidade } = await this.registroDoPet(petId, dto);
    await this.assertLimite(chave, dto.entidade_id);

    const assinatura = await this.identificar(autor);
    const s3Key = `anexos/${petId}/${randomUUID()}.${extensao}`;
    const nomeArquivo = nomeDeExibicao(arquivo.originalname, extensao);
    const agora = new Date();

    await this.upload.putPrivate(s3Key, arquivo.buffer, arquivo.mimetype);

    try {
      const anexo = await this.prisma.$transaction(async (tx) => {
        const criado = await tx.anexoClinico.create({
          data: {
            petId,
            [chave]: dto.entidade_id,
            s3Key,
            nomeArquivo,
            mimeType: arquivo.mimetype,
            tamanhoBytes: arquivo.buffer.length,
            sha256: createHash('sha256').update(arquivo.buffer).digest('hex'),
            enviadoPorTipo: autor.isVet ? Role.VET : Role.TUTOR,
            enviadoPorId: autor.id,
            enviadoPorNome: assinatura.nome,
            // Quem chega aqui como veterinário já passou pelo guard de CRMV
            // verificado e pelo vínculo com o pet: o envio é a conferência.
            ...(autor.isVet && assinatura.crmv
              ? {
                  verificadoEm: agora,
                  verificadoPorId: autor.id,
                  verificadoPorNome: assinatura.nome,
                  verificadoPorCrmv: assinatura.crmv,
                }
              : {}),
          },
        });
        await this.acoes.registrar(
          {
            petId,
            tipo: AcaoClinicaTipo.ANEXO_ADICIONADO,
            entidade,
            entidadeId: dto.entidade_id,
            autorId: autor.id,
            autorTipo: autor.isVet ? Role.VET : Role.TUTOR,
            detalhes: {
              anexo_id: criado.id,
              nome_arquivo: criado.nomeArquivo,
              verificado: criado.verificadoEm !== null,
            },
          },
          tx,
        );
        return criado;
      });
      return toAnexoResponseDto(anexo);
    } catch (error) {
      // O objeto já foi para o bucket e a linha não entrou: sem isto sobraria
      // um arquivo sem dono. Falha aqui só vira log — o erro que importa é o
      // da gravação.
      await this.upload.removePrivate(s3Key).catch((e: unknown) => {
        this.logger.error(`Objeto órfão em ${s3Key}`, e as Error);
      });
      throw error;
    }
  }

  /** Link temporário para abrir o arquivo. */
  async linkDoArquivo(
    id: string,
    autor: Autor,
  ): Promise<AnexoArquivoResponseDto> {
    const anexo = await this.obter(id);
    await this.petService.assertAccess(anexo.petId, autor.id, autor.isVet);

    const url = await this.upload.presignDownload(anexo.s3Key, {
      filename: anexo.nomeArquivo,
      contentType: anexo.mimeType,
      expiresInSeconds: ANEXO_LINK_VALIDADE_SEGUNDOS,
    });
    return {
      url,
      expira_em: new Date(Date.now() + ANEXO_LINK_VALIDADE_SEGUNDOS * 1000),
    };
  }

  /**
   * Veterinário atesta que conferiu o comprovante. Idempotente: quem chega
   * depois não sobrescreve o atestado de quem verificou primeiro.
   */
  async verificar(
    id: string,
    veterinarioId: string,
  ): Promise<AnexoResponseDto> {
    const anexo = await this.obter(id);
    await this.petService.assertAccess(anexo.petId, veterinarioId, true);
    if (anexo.verificadoEm) {
      return toAnexoResponseDto(anexo);
    }

    const { nome, crmv } = await this.identificar({
      id: veterinarioId,
      isVet: true,
    });
    if (!crmv) {
      throw new BadRequestException('Veterinário sem CRMV cadastrado.');
    }

    const { entidade, entidadeId } = alvoDoAnexo(anexo);
    const verificado = await this.prisma.$transaction(async (tx) => {
      // `verificadoEm: null` no filtro fecha a corrida entre dois veterinários.
      const { count } = await tx.anexoClinico.updateMany({
        where: { id, verificadoEm: null, deletedAt: null },
        data: {
          verificadoEm: new Date(),
          verificadoPorId: veterinarioId,
          verificadoPorNome: nome,
          verificadoPorCrmv: crmv,
        },
      });
      const atual = await tx.anexoClinico.findUniqueOrThrow({ where: { id } });
      if (count === 1) {
        await this.acoes.registrar(
          {
            petId: anexo.petId,
            tipo: AcaoClinicaTipo.ANEXO_VERIFICADO,
            entidade,
            entidadeId,
            autorId: veterinarioId,
            autorTipo: Role.VET,
            detalhes: { anexo_id: id, nome_arquivo: anexo.nomeArquivo },
          },
          tx,
        );
      }
      return atual;
    });
    return toAnexoResponseDto(verificado);
  }

  /**
   * Exclusão lógica. O tutor remove qualquer comprovante do próprio pet; o
   * veterinário, só os que ele mesmo enviou (mesma regra dos registros).
   */
  async remover(id: string, autor: Autor): Promise<void> {
    const anexo = await this.obter(id);
    await this.petService.assertAccess(anexo.petId, autor.id, autor.isVet);
    assertPodeRemover(
      {
        veterinarioId:
          anexo.enviadoPorTipo === Role.VET ? anexo.enviadoPorId : null,
      },
      autor.id,
      autor.isVet,
    );

    const { entidade, entidadeId } = alvoDoAnexo(anexo);
    await this.prisma.$transaction(async (tx) => {
      await tx.anexoClinico.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await this.acoes.registrar(
        {
          petId: anexo.petId,
          tipo: AcaoClinicaTipo.ANEXO_REMOVIDO,
          entidade,
          entidadeId,
          autorId: autor.id,
          autorTipo: autor.isVet ? Role.VET : Role.TUTOR,
          detalhes: {
            anexo_id: id,
            nome_arquivo: anexo.nomeArquivo,
            verificado: anexo.verificadoEm !== null,
          },
        },
        tx,
      );
    });
  }

  private async obter(id: string): Promise<AnexoClinico> {
    const anexo = await this.prisma.anexoClinico.findFirst({
      where: { id, deletedAt: null },
    });
    if (!anexo) {
      throw new NotFoundException(`Anexo ${id} não encontrado`);
    }
    return anexo;
  }

  /**
   * O registro precisa ser do pet da URL e estar ativo. Sem o `petId` no
   * filtro, dava para pendurar um anexo no registro de outro pet a que o
   * usuário não tem acesso.
   */
  private async registroDoPet(
    petId: string,
    dto: CreateAnexoDto,
  ): Promise<{ chave: ChaveDoRegistro; entidade: EntidadeClinica }> {
    const where = { id: dto.entidade_id, petId, deletedAt: null };
    const select = { id: true };
    let encontrado: { id: string } | null;
    let chave: ChaveDoRegistro;
    let entidade: EntidadeClinica;

    switch (dto.entidade) {
      case 'VACINA':
        encontrado = await this.prisma.vaccineRecord.findFirst({
          where,
          select,
        });
        chave = 'vaccineRecordId';
        entidade = EntidadeClinica.VACINA;
        break;
      case 'VERMIFUGO':
        encontrado = await this.prisma.dewormingRecord.findFirst({
          where,
          select,
        });
        chave = 'dewormingRecordId';
        entidade = EntidadeClinica.VERMIFUGO;
        break;
      default:
        encontrado = await this.prisma.medicationRecord.findFirst({
          where,
          select,
        });
        chave = 'medicationRecordId';
        entidade = EntidadeClinica.MEDICACAO;
    }

    if (!encontrado) {
      throw new NotFoundException(
        `Registro ${dto.entidade_id} não encontrado neste pet`,
      );
    }
    return { chave, entidade };
  }

  private async assertLimite(
    chave: ChaveDoRegistro,
    registroId: string,
  ): Promise<void> {
    const total = await this.prisma.anexoClinico.count({
      where: { [chave]: registroId, deletedAt: null },
    });
    if (total >= ANEXO_MAX_POR_REGISTRO) {
      throw new BadRequestException(
        `Cada registro aceita no máximo ${ANEXO_MAX_POR_REGISTRO} comprovantes.`,
      );
    }
  }

  /**
   * Nome (e CRMV) gravados junto do anexo. Resolvido no servidor: aceitar o
   * nome do corpo da requisição deixaria assinar um comprovante em nome de
   * outra pessoa.
   */
  private async identificar(
    autor: Autor,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<{ nome: string; crmv: string | null }> {
    if (autor.isVet) {
      const vet = await tx.veterinario.findUnique({
        where: { id: autor.id },
        select: { nome: true, crmv: true },
      });
      if (vet) return { nome: vet.nome, crmv: vet.crmv };
    } else {
      const tutor = await tx.tutor.findUnique({
        where: { id: autor.id },
        select: { name: true },
      });
      if (tutor) return { nome: tutor.name, crmv: null };
    }
    return { nome: autor.id, crmv: null };
  }
}
