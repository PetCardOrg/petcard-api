import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CarteiraDigital, Pet } from '@prisma/client';
import {
  CreatePetDto,
  PetResponseDto,
  Sex,
  Species,
  UpdatePetDto,
} from '@petcardorg/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CardService } from '../card/card.service';
import { TutorService } from '../tutor/tutor.service';
import { UploadService } from '../upload/upload.service';

type PetWithCard = Pet & { carteiraDigital: CarteiraDigital | null };

function toResponseDto(pet: PetWithCard): PetResponseDto {
  return {
    id: pet.id,
    name: pet.name,
    species: pet.species as unknown as Species,
    breed: pet.breed ?? undefined,
    sex: pet.sex as unknown as Sex,
    birth_date: pet.birthDate
      ? pet.birthDate.toISOString().split('T')[0]
      : undefined,
    weight: pet.weight ?? undefined,
    photo_url: pet.photoUrl ?? undefined,
    qr_code_url: pet.carteiraDigital?.qrCodeUrl ?? undefined,
    tutor_id: pet.tutorId,
    created_at: pet.createdAt,
    updated_at: pet.updatedAt,
  };
}

type PetInput = Omit<CreatePetDto, 'tutor_id'>;

@Injectable()
export class PetService {
  private readonly logger = new Logger(PetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tutorService: TutorService,
    private readonly cardService: CardService,
    private readonly uploadService: UploadService,
  ) {}

  async create(auth0Id: string, dto: PetInput): Promise<PetResponseDto> {
    const tutor = await this.tutorService.findByAuth0Id(auth0Id);
    const pet = await this.prisma.pet.create({
      data: {
        name: dto.name,
        species: dto.species,
        breed: dto.breed,
        sex: dto.sex,
        birthDate: dto.birth_date ? new Date(dto.birth_date) : null,
        weight: dto.weight,
        photoUrl: dto.photo_url,
        tutorId: tutor.id,
      },
    });

    await this.generateAndUploadQrCode(pet.id);

    return this.findById(pet.id);
  }

  async regenerateQrCode(
    petId: string,
    auth0Id: string,
  ): Promise<PetResponseDto> {
    await this.assertOwnership(petId, auth0Id);

    const qrCodeUrl = await this.generateAndUploadQrCode(petId);

    if (!qrCodeUrl) {
      throw new Error('Failed to generate and upload QR Code');
    }

    return this.findById(petId);
  }

  async findAllForTutor(auth0Id: string): Promise<PetResponseDto[]> {
    const tutor = await this.tutorService.findByAuth0Id(auth0Id);
    const pets = await this.prisma.pet.findMany({
      where: { tutorId: tutor.id },
      include: { carteiraDigital: true },
    });
    return pets.map(toResponseDto);
  }

  async findOne(
    id: string,
    auth0Id: string,
    isVet: boolean,
  ): Promise<PetResponseDto> {
    const pet = await this.prisma.pet.findUnique({
      where: { id },
      include: { carteiraDigital: true },
    });
    if (!pet) {
      throw new NotFoundException(`Pet with id ${id} not found`);
    }
    if (!isVet) {
      const tutor = await this.tutorService.findByAuth0Id(auth0Id);
      if (pet.tutorId !== tutor.id) {
        throw new ForbiddenException('You do not own this pet');
      }
    }
    return toResponseDto(pet);
  }

  async update(
    id: string,
    auth0Id: string,
    dto: Omit<UpdatePetDto, 'tutor_id'>,
  ): Promise<PetResponseDto> {
    await this.assertOwnership(id, auth0Id);
    const pet = await this.prisma.pet.update({
      where: { id },
      data: {
        name: dto.name,
        species: dto.species,
        breed: dto.breed,
        sex: dto.sex,
        birthDate: dto.birth_date ? new Date(dto.birth_date) : undefined,
        weight: dto.weight,
        photoUrl: dto.photo_url,
      },
      include: { carteiraDigital: true },
    });
    return toResponseDto(pet);
  }

  private async findById(id: string): Promise<PetResponseDto> {
    const pet = await this.prisma.pet.findUniqueOrThrow({
      where: { id },
      include: { carteiraDigital: true },
    });
    return toResponseDto(pet);
  }

  async remove(id: string, auth0Id: string): Promise<void> {
    await this.assertOwnership(id, auth0Id);
    await this.prisma.pet.delete({ where: { id } });
  }

  async assertOwnership(petId: string, auth0Id: string): Promise<Pet> {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) {
      throw new NotFoundException(`Pet with id ${petId} not found`);
    }
    const tutor = await this.tutorService.findByAuth0Id(auth0Id);
    if (pet.tutorId !== tutor.id) {
      throw new ForbiddenException('You do not own this pet');
    }
    return pet;
  }

  async assertAccess(
    petId: string,
    auth0Id: string,
    isVet: boolean,
  ): Promise<Pet> {
    if (isVet) {
      const pet = await this.prisma.pet.findUnique({ where: { id: petId } });
      if (!pet) {
        throw new NotFoundException(`Pet with id ${petId} not found`);
      }
      return pet;
    }
    return this.assertOwnership(petId, auth0Id);
  }

  private async generateAndUploadQrCode(petId: string): Promise<string | null> {
    try {
      const token = await this.cardService.issueTokenForPet(petId);
      const buffer = await this.cardService.generateQrCode(token);
      const key = `qr-codes/${petId}.png`;
      const url = await this.uploadService.uploadBuffer(
        buffer,
        key,
        'image/png',
      );
      await this.cardService.setCardQrCodeUrl(petId, url);
      return url;
    } catch (error) {
      this.logger.error(
        `Failed to generate/upload QR Code for pet ${petId}`,
        error instanceof Error ? error.stack : error,
      );
      return null;
    }
  }
}
