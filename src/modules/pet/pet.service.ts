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
import { QrCodePublisher } from '../queue/qr-code.publisher';
import { TutorService } from '../tutor/tutor.service';

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
    private readonly qrCodePublisher: QrCodePublisher,
  ) {}

  private async enqueueQrCodeGeneration(petId: string): Promise<void> {
    try {
      await this.qrCodePublisher.publishGenerate(petId);
    } catch (error) {
      this.logger.error(
        `QR Code job NOT enqueued for pet ${petId} — needs manual regeneration`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  async create(userId: string, dto: PetInput): Promise<PetResponseDto> {
    await this.tutorService.findById(userId);
    const pet = await this.prisma.pet.create({
      data: {
        name: dto.name,
        species: dto.species,
        breed: dto.breed,
        sex: dto.sex,
        birthDate: dto.birth_date ? new Date(dto.birth_date) : null,
        weight: dto.weight,
        photoUrl: dto.photo_url,
        tutorId: userId,
      },
    });

    await this.enqueueQrCodeGeneration(pet.id);

    return this.findById(pet.id);
  }

  async regenerateQrCode(petId: string, userId: string): Promise<void> {
    await this.assertOwnership(petId, userId);
    await this.enqueueQrCodeGeneration(petId);
  }

  async findAllForTutor(userId: string): Promise<PetResponseDto[]> {
    const pets = await this.prisma.pet.findMany({
      where: { tutorId: userId },
      include: { carteiraDigital: true },
    });
    return pets.map(toResponseDto);
  }

  async findOne(
    id: string,
    userId: string,
    isVet: boolean,
  ): Promise<PetResponseDto> {
    const pet = await this.prisma.pet.findUnique({
      where: { id },
      include: { carteiraDigital: true },
    });
    if (!pet) {
      throw new NotFoundException(`Pet with id ${id} not found`);
    }
    if (isVet) {
      await this.assertVinculoVet(id, userId);
    } else if (pet.tutorId !== userId) {
      throw new ForbiddenException('You do not own this pet');
    }
    return toResponseDto(pet);
  }

  async update(
    id: string,
    userId: string,
    dto: Omit<UpdatePetDto, 'tutor_id'>,
  ): Promise<PetResponseDto> {
    await this.assertOwnership(id, userId);
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

  async remove(id: string, userId: string): Promise<void> {
    await this.assertOwnership(id, userId);
    await this.prisma.pet.delete({ where: { id } });
  }

  async assertOwnership(petId: string, userId: string): Promise<Pet> {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) {
      throw new NotFoundException(`Pet with id ${petId} not found`);
    }
    if (pet.tutorId !== userId) {
      throw new ForbiddenException('You do not own this pet');
    }
    return pet;
  }

  /**
   * Acesso ao pet por tutor dono ou por veterinário que o atende.
   *
   * O papel VET sozinho não abre a ficha de ninguém: sem o vínculo, bastava
   * conhecer o id de um pet para ler e escrever no prontuário de qualquer
   * animal da base. O vínculo nasce da leitura do QR Code
   * (`POST /veterinarios/me/pets`), que é a autorização de fato do atendimento
   * — quem leu o código esteve com o pet na frente.
   */
  async assertAccess(
    petId: string,
    userId: string,
    isVet: boolean,
  ): Promise<Pet> {
    if (isVet) {
      const pet = await this.prisma.pet.findUnique({ where: { id: petId } });
      if (!pet) {
        throw new NotFoundException(`Pet with id ${petId} not found`);
      }
      await this.assertVinculoVet(petId, userId);
      return pet;
    }
    return this.assertOwnership(petId, userId);
  }

  /** Exige que o pet esteja na lista de atendidos do veterinário. */
  private async assertVinculoVet(
    petId: string,
    veterinarioId: string,
  ): Promise<void> {
    const vinculo = await this.prisma.petAtendido.findUnique({
      where: { veterinarioId_petId: { veterinarioId, petId } },
    });
    if (!vinculo) {
      throw new ForbiddenException(
        'Pet fora da sua lista de atendidos. Leia o QR Code da carteira para iniciar o atendimento.',
      );
    }
  }
}
