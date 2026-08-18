import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as QRCode from 'qrcode';
import {
  CarteiraDigitalResponseDto,
  CarteiraDigitalPublicResponseDto,
  CarteiraDigitalClinicaResponseDto,
  Sex,
  Species,
} from '@petcardorg/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { TutorService } from '../tutor/tutor.service';

interface CarteiraDigitalFullResponseDto extends CarteiraDigitalResponseDto {
  weight?: number;
  public_url?: string;
  upcoming_vaccines_count: number;
  upcoming_dewormings_count: number;
  active_medications_count: number;
}

function isFutureOrToday(date?: Date | null): boolean {
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getTime() >= today.getTime();
}

function isMedicationActive(endDate?: Date | null): boolean {
  return !endDate || isFutureOrToday(endDate);
}

@Injectable()
export class CardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly tutorService: TutorService,
  ) {}

  async generateQrCode(token: string): Promise<Buffer> {
    return this.generateBuffer(this.buildPublicUrl(token));
  }

  async issueTokenForPet(petId: string): Promise<string> {
    const token = randomUUID();
    await this.prisma.carteiraDigital.upsert({
      where: { petId },
      create: { petId, token },
      update: { token },
    });
    return token;
  }

  async setCardQrCodeUrl(petId: string, qrCodeUrl: string): Promise<void> {
    await this.prisma.carteiraDigital.update({
      where: { petId },
      data: { qrCodeUrl },
    });
  }

  /**
   * Carteira pública servida por token do QR, SEM autenticação (api#114).
   * Expõe apenas o subconjunto seguro para verificação de emergência
   * (identificação do pet/tutor + histórico de vacinas e vermífugos). Dados
   * clínicos sensíveis — notas clínicas (diagnóstico/prescrição/observações do
   * vet) e medicações em uso — NÃO são incluídos aqui; ficam restritos aos
   * endpoints autenticados do tutor/veterinário.
   */
  async findPublicByToken(
    token: string,
  ): Promise<CarteiraDigitalPublicResponseDto> {
    const card = await this.prisma.carteiraDigital.findUnique({
      where: { token },
      include: {
        pet: {
          include: {
            tutor: true,
            vaccineRecords: {
              where: { deletedAt: null },
              orderBy: { appliedAt: 'desc' },
            },
            dewormingRecords: {
              where: { deletedAt: null },
              orderBy: { appliedAt: 'desc' },
            },
          },
        },
      },
    });

    if (!card) {
      throw new NotFoundException('Carteira digital not found');
    }

    const { pet } = card;

    return {
      pet_id: pet.id,
      pet_name: pet.name,
      species: pet.species as unknown as Species,
      breed: pet.breed ?? undefined,
      sex: pet.sex as unknown as Sex,
      birth_date: pet.birthDate
        ? pet.birthDate.toISOString().split('T')[0]
        : undefined,
      weight: pet.weight ?? undefined,
      photo_url: pet.photoUrl ?? undefined,
      qr_code_url: card.qrCodeUrl ?? undefined,
      tutor_name: pet.tutor.name,
      vaccines: pet.vaccineRecords.map((r) => ({
        id: r.id,
        pet_id: r.petId,
        vaccine_name: r.vaccineName,
        applied_at: r.appliedAt.toISOString(),
        next_dose_at: r.nextDoseAt?.toISOString(),
        veterinarian_name: r.veterinarianName ?? undefined,
        notes: r.notes ?? undefined,
        created_at: r.createdAt,
        updated_at: r.updatedAt,
      })),
      dewormings: pet.dewormingRecords.map((r) => ({
        id: r.id,
        pet_id: r.petId,
        product_name: r.productName,
        applied_at: r.appliedAt.toISOString(),
        next_dose_at: r.nextDoseAt?.toISOString(),
        veterinarian_name: r.veterinarianName ?? undefined,
        notes: r.notes ?? undefined,
        created_at: r.createdAt,
        updated_at: r.updatedAt,
      })),
      // Medicações omitidas da carteira pública (api#114): revelam condições
      // de saúde em tratamento. Ficam só nos endpoints autenticados. O campo é
      // mantido (vazio) por compatibilidade com o DTO/consumidores (web).
      medications: [],
      issued_at: card.createdAt,
    };
  }

  /**
   * Carteira vista por veterinário com CRMV verificado que possui o token do
   * QR (api#113). Reaproveita a carteira pública e devolve, por cima, o que a
   * api#114 tirou dela por ser sensível: medicações e notas clínicas.
   *
   * O controle de acesso mora nos guards da rota — aqui já se assume que o
   * chamador foi autenticado, tem papel VET e está com o CRMV verificado.
   */
  async findClinicaByToken(
    token: string,
    veterinarioId: string,
  ): Promise<CarteiraDigitalClinicaResponseDto> {
    const publica = await this.findPublicByToken(token);

    const [vet, medications, notas] = await Promise.all([
      this.prisma.veterinario.findUnique({
        where: { id: veterinarioId },
        select: { crmv: true },
      }),
      this.prisma.medicationRecord.findMany({
        where: { petId: publica.pet_id, deletedAt: null },
        orderBy: { startDate: 'desc' },
      }),
      this.prisma.notaClinica.findMany({
        where: { petId: publica.pet_id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: { veterinario: { select: { nome: true, crmv: true } } },
      }),
    ]);

    return {
      ...publica,
      medications: medications.map((r) => ({
        id: r.id,
        pet_id: r.petId,
        medication_name: r.medicationName,
        dosage: r.dosage,
        frequency: r.frequency,
        start_date: r.startDate.toISOString(),
        end_date: r.endDate?.toISOString(),
        notes: r.notes ?? undefined,
        created_at: r.createdAt,
        updated_at: r.updatedAt,
      })),
      clinical_notes: notas.map((n) => ({
        id: n.id,
        pet_id: n.petId,
        veterinario_id: n.veterinarioId,
        veterinario_nome: n.veterinario.nome,
        veterinario_crmv: n.veterinario.crmv,
        google_place_id: n.googlePlaceId ?? undefined,
        diagnostico: n.diagnostico,
        prescricao: n.prescricao ?? undefined,
        observacoes: n.observacoes ?? undefined,
        created_at: n.createdAt,
        updated_at: n.updatedAt,
      })),
      accessed_by_crmv: vet?.crmv ?? '',
    };
  }

  async findByPetIdForTutor(
    petId: string,
    userId: string,
  ): Promise<CarteiraDigitalFullResponseDto> {
    const tutor = await this.tutorService.findById(userId);
    const pet = await this.prisma.pet.findUnique({
      where: { id: petId },
      include: {
        tutor: true,
        carteiraDigital: true,
        vaccineRecords: {
          where: { deletedAt: null },
          select: { nextDoseAt: true },
        },
        dewormingRecords: {
          where: { deletedAt: null },
          select: { nextDoseAt: true },
        },
        medicationRecords: {
          where: { deletedAt: null },
          select: { endDate: true },
        },
      },
    });

    if (!pet) {
      throw new NotFoundException(`Pet with id ${petId} not found`);
    }

    if (pet.tutorId !== tutor.id) {
      throw new NotFoundException(`Pet with id ${petId} not found`);
    }

    const card =
      pet.carteiraDigital ??
      (await this.prisma.carteiraDigital.upsert({
        where: { petId },
        create: { petId, token: randomUUID() },
        update: {},
      }));

    return {
      pet_id: pet.id,
      pet_name: pet.name,
      species: pet.species as unknown as Species,
      breed: pet.breed ?? undefined,
      sex: pet.sex as unknown as Sex,
      birth_date: pet.birthDate
        ? pet.birthDate.toISOString().split('T')[0]
        : undefined,
      weight: pet.weight ?? undefined,
      photo_url: pet.photoUrl ?? undefined,
      qr_code_url: card.qrCodeUrl ?? undefined,
      public_url: this.buildPublicUrl(card.token),
      tutor_id: pet.tutor.id,
      tutor_name: pet.tutor.name,
      vaccines_count: pet.vaccineRecords.length,
      upcoming_vaccines_count: pet.vaccineRecords.filter((record) =>
        isFutureOrToday(record.nextDoseAt),
      ).length,
      dewormings_count: pet.dewormingRecords.length,
      upcoming_dewormings_count: pet.dewormingRecords.filter((record) =>
        isFutureOrToday(record.nextDoseAt),
      ).length,
      medications_count: pet.medicationRecords.length,
      active_medications_count: pet.medicationRecords.filter((record) =>
        isMedicationActive(record.endDate),
      ).length,
      issued_at: card.createdAt,
    };
  }

  private buildPublicUrl(token: string): string {
    const baseUrl = this.configService.get<string>(
      'card.publicBaseUrl',
      'https://card.petcard.app/#',
    );
    return `${baseUrl.replace(/\/+$/, '')}/${token}`;
  }

  private async generateBuffer(data: string): Promise<Buffer> {
    try {
      return await QRCode.toBuffer(data, {
        type: 'png',
        width: 400,
        margin: 2,
        errorCorrectionLevel: 'M',
      });
    } catch {
      throw new InternalServerErrorException('Failed to generate QR Code');
    }
  }
}
