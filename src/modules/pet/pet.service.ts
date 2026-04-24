import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pet } from '@prisma/client';
import {
  CreatePetDto,
  PetResponseDto,
  Sex,
  Species,
  UpdatePetDto,
} from '@petcardorg/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { TutorService } from '../tutor/tutor.service';

function toResponseDto(pet: Pet): PetResponseDto {
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
    tutor_id: pet.tutorId,
    created_at: pet.createdAt,
    updated_at: pet.updatedAt,
  };
}

type PetInput = Omit<CreatePetDto, 'tutor_id'>;

@Injectable()
export class PetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tutorService: TutorService,
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
    return toResponseDto(pet);
  }

  async findAllForTutor(auth0Id: string): Promise<PetResponseDto[]> {
    const tutor = await this.tutorService.findByAuth0Id(auth0Id);
    const pets = await this.prisma.pet.findMany({
      where: { tutorId: tutor.id },
    });
    return pets.map(toResponseDto);
  }

  async findOne(
    id: string,
    auth0Id: string,
    isVet: boolean,
  ): Promise<PetResponseDto> {
    const pet = await this.prisma.pet.findUnique({ where: { id } });
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
}
