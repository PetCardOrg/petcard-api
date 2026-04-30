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
  Sex,
  Species,
} from '@petcardorg/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { TutorService } from '../tutor/tutor.service';

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
    const baseUrl = this.configService.get<string>(
      'card.publicBaseUrl',
      'https://card.petcard.app',
    );
    const url = `${baseUrl.replace(/\/+$/, '')}/${token}`;
    return this.generateBuffer(url);
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

  async findPublicByToken(
    token: string,
  ): Promise<CarteiraDigitalPublicResponseDto> {
    const card = await this.prisma.carteiraDigital.findUnique({
      where: { token },
      include: {
        pet: {
          include: {
            tutor: true,
            vaccineRecords: { orderBy: { appliedAt: 'desc' } },
            dewormingRecords: { orderBy: { appliedAt: 'desc' } },
            medicationRecords: { orderBy: { startDate: 'desc' } },
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
      medications: pet.medicationRecords.map((r) => ({
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
      issued_at: card.createdAt,
    };
  }

  async findByPetIdForTutor(
    petId: string,
    auth0Id: string,
  ): Promise<CarteiraDigitalResponseDto> {
    const tutor = await this.tutorService.findByAuth0Id(auth0Id);
    const pet = await this.prisma.pet.findUnique({
      where: { id: petId },
      include: {
        tutor: true,
        carteiraDigital: true,
        vaccineRecords: {
          select: {
            nextDoseAt: true,
          },
        },
        dewormingRecords: {
          select: {
            nextDoseAt: true,
          },
        },
        medicationRecords: {
          select: {
            endDate: true,
          },
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
      'https://card.petcard.app',
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
