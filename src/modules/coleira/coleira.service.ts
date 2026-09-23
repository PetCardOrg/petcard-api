import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { NotificationKind, PetScan } from '@prisma/client';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { ColeiraPublicResponseDto } from './dto/coleira-public-response.dto';
import { PetScanResponseDto } from './dto/pet-scan-response.dto';
import { TagColeiraResponseDto } from './dto/tag-coleira-response.dto';
import { RegistrarLeituraDto } from './dto/registrar-leitura.dto';

/**
 * Janela de dedupe do push por pet (achado 2 da auditoria de rotas
 * públicas). A rota é `@Public()` e o limite de IP (10 req/min) não impede um
 * único achador de manter a coleira aberta e gerar uma leitura atrás da
 * outra — sem dedupe isso vira ~14 mil push por dia para o mesmo tutor.
 *
 * A dedupe é só do push: a leitura continua sendo gravada a cada chamada
 * (perder a localização de um pet perdido é o pior desfecho, ver comentário
 * do model `PetScan`). Por pet, não por token+IP — o que importa para o
 * tutor é não ser inundado de avisos do mesmo pet, não quem está lendo.
 * 15 minutos é tempo de sobra para alguém tentar liberar o GPS sem repetir o
 * aviso, e curto o bastante para reabrir se o pet for encontrado de novo mais
 * tarde, por outra pessoa ou em outro lugar.
 */
const JANELA_DEDUPE_PUSH_MINUTOS = 15;

/**
 * Teto do histórico de leituras que a tela do tutor carrega (achado 3 da
 * auditoria de rotas públicas). Sem a dedupe do achado 2, um único achador
 * insistente enche a tabela; com ou sem ela, a tela não precisa do histórico
 * inteiro — as leituras mais recentes já respondem "onde e quando".
 */
const LIMITE_LEITURAS_LISTADAS = 100;

function toPetScanResponseDto(scan: PetScan): PetScanResponseDto {
  return {
    id: scan.id,
    pet_id: scan.petId,
    latitude: scan.latitude ?? undefined,
    longitude: scan.longitude ?? undefined,
    accuracy_meters: scan.accuracyMeters ?? undefined,
    created_at: scan.createdAt.toISOString(),
  };
}

@Injectable()
export class ColeiraService {
  private readonly logger = new Logger(ColeiraService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Devolve o token da coleira, criando um só quando ainda não existe.
   *
   * Mesma separação da carteira (ver `CardService.ensureTokenForPet`): o job de
   * QR pode rodar mais de uma vez para a mesma mensagem, e a tag da coleira é
   * justamente a que costuma estar impressa e presa no animal — rotacionar num
   * retry deixaria o achador na página de "não encontrado".
   */
  async ensureTokenForPet(petId: string): Promise<string> {
    const tag = await this.prisma.tagColeira.upsert({
      where: { petId },
      create: { petId, token: randomUUID() },
      update: {},
    });
    return tag.token;
  }

  /** Troca o token da coleira, invalidando a tag anterior. */
  async rotateTokenForPet(petId: string): Promise<string> {
    const token = randomUUID();
    await this.prisma.tagColeira.upsert({
      where: { petId },
      create: { petId, token },
      update: { token },
    });
    return token;
  }

  async setQrCodeUrl(petId: string, qrCodeUrl: string): Promise<void> {
    await this.prisma.tagColeira.update({
      where: { petId },
      data: { qrCodeUrl },
    });
  }

  async generateQrCode(token: string): Promise<Buffer> {
    return QRCode.toBuffer(this.buildPublicUrl(token), {
      type: 'png',
      width: 400,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
  }

  buildPublicUrl(token: string): string {
    const base = this.configService.get<string>('card.collarBaseUrl')!;
    return `${base.replace(/\/+$/, '')}/${token}`;
  }

  /**
   * QR da coleira do pet, para o tutor exibir ou imprimir.
   *
   * Pet de outro tutor responde 404 pelo mesmo motivo do histórico: 403 diria
   * que o pet existe, e o id viraria sonda para cadastros alheios.
   */
  async findTagForTutor(
    petId: string,
    tutorId: string,
  ): Promise<TagColeiraResponseDto> {
    const pet = await this.prisma.pet.findFirst({
      where: { id: petId, tutorId },
      select: { tagColeira: true },
    });

    if (!pet?.tagColeira) {
      throw new NotFoundException('Tag da coleira não encontrada');
    }

    return {
      pet_id: petId,
      qr_code_url: pet.tagColeira.qrCodeUrl ?? undefined,
      public_url: this.buildPublicUrl(pet.tagColeira.token),
    };
  }

  /**
   * Dados que a página do achador mostra.
   *
   * Sem histórico clínico por decisão de privacidade: quem lê o QR da coleira
   * é um estranho na rua. Vacina e medicação seguem na carteira digital, que
   * tem token próprio e outro público.
   */
  async findPublicByToken(token: string): Promise<ColeiraPublicResponseDto> {
    const tag = await this.prisma.tagColeira.findUnique({
      where: { token },
      select: {
        pet: {
          select: {
            id: true,
            name: true,
            species: true,
            breed: true,
            sex: true,
            photoUrl: true,
            tutor: { select: { name: true, phone: true } },
          },
        },
      },
    });

    if (!tag) {
      throw new NotFoundException('Tag da coleira não encontrada');
    }

    const { pet } = tag;
    return {
      pet_id: pet.id,
      pet_name: pet.name,
      species: pet.species,
      breed: pet.breed ?? undefined,
      sex: pet.sex,
      photo_url: pet.photoUrl ?? undefined,
      tutor_name: pet.tutor.name,
      tutor_phone: pet.tutor.phone ?? undefined,
    };
  }

  /**
   * Registra que alguém encontrou o pet e avisa o tutor.
   *
   * A leitura é gravada antes do push, e o push é best-effort. A ordem é a
   * regra: tutor sem device token, FCM desligado ou fila fora do ar não podem
   * apagar a única pista de onde o pet está.
   *
   * O push, ao contrário da leitura, é deduplicado por
   * `JANELA_DEDUPE_PUSH_MINUTOS`: já ter uma leitura recente do mesmo pet
   * dentro da janela quer dizer que o tutor já foi avisado.
   */
  async registrarLeitura(
    token: string,
    dto: RegistrarLeituraDto,
  ): Promise<PetScanResponseDto> {
    const tag = await this.prisma.tagColeira.findUnique({
      where: { token },
      select: { pet: { select: { id: true, name: true, tutorId: true } } },
    });

    if (!tag) {
      throw new NotFoundException('Tag da coleira não encontrada');
    }

    const { pet } = tag;
    const temLocalizacao =
      dto.latitude !== undefined && dto.longitude !== undefined;

    const inicioDaJanela = new Date(
      Date.now() - JANELA_DEDUPE_PUSH_MINUTOS * 60_000,
    );
    const leituraRecente = await this.prisma.petScan.findFirst({
      where: { petId: pet.id, createdAt: { gte: inicioDaJanela } },
      select: { id: true },
    });

    const scan = await this.prisma.petScan.create({
      data: {
        petId: pet.id,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracyMeters: dto.accuracy_meters,
      },
    });

    if (!leituraRecente) {
      try {
        await this.notificationService.schedulePush({
          tutorId: pet.tutorId,
          kind: NotificationKind.PET_SCAN,
          referenceType: 'PET_SCAN',
          referenceId: scan.id,
          title: `${pet.name} foi encontrado`,
          body: temLocalizacao
            ? `Alguém leu o QR da coleira e compartilhou onde ${pet.name} está.`
            : `Alguém leu o QR da coleira de ${pet.name}, mas não compartilhou a localização.`,
          // O FCM só transporta string no data — número vira payload inválido.
          data: {
            type: 'pet_scan',
            pet_id: pet.id,
            scan_id: scan.id,
            ...(temLocalizacao
              ? {
                  latitude: String(dto.latitude),
                  longitude: String(dto.longitude),
                }
              : {}),
          },
        });
      } catch (error) {
        this.logger.error(
          `Failed to schedule push notification for pet scan ${scan.id}`,
          error instanceof Error ? error.stack : error,
        );
      }
    }

    return toPetScanResponseDto(scan);
  }

  /**
   * Leituras do QR de um pet, da mais recente para a mais antiga.
   *
   * Pet de outro tutor responde 404, e não 403: dizer "existe, mas não é seu"
   * deixaria o id do pet servir de sonda para descobrir cadastros alheios.
   */
  async listScansForTutor(
    petId: string,
    tutorId: string,
  ): Promise<PetScanResponseDto[]> {
    const pet = await this.prisma.pet.findFirst({
      where: { id: petId, tutorId },
      select: { id: true },
    });

    if (!pet) {
      throw new NotFoundException('Pet not found');
    }

    const scans = await this.prisma.petScan.findMany({
      where: { petId },
      orderBy: { createdAt: 'desc' },
      take: LIMITE_LEITURAS_LISTADAS,
    });

    return scans.map(toPetScanResponseDto);
  }
}
