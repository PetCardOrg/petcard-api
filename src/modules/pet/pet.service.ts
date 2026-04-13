import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pet } from '@prisma/client';
import { CreatePetDto, UpdatePetDto } from '@petcardorg/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { TutorService } from '../tutor/tutor.service';

type PetInput = Omit<CreatePetDto, 'tutor_id'>;

@Injectable()
export class PetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tutorService: TutorService,
  ) {}

  async create(auth0Id: string, dto: PetInput): Promise<Pet> {
    const tutor = await this.tutorService.findByAuth0Id(auth0Id);
    return this.prisma.pet.create({
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
  }

  async findAllForTutor(auth0Id: string): Promise<Pet[]> {
    const tutor = await this.tutorService.findByAuth0Id(auth0Id);
    return this.prisma.pet.findMany({ where: { tutorId: tutor.id } });
  }

  async findOne(id: string, auth0Id: string, isVet: boolean): Promise<Pet> {
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
    return pet;
  }

  async update(
    id: string,
    auth0Id: string,
    dto: Omit<UpdatePetDto, 'tutor_id'>,
  ): Promise<Pet> {
    await this.assertOwnership(id, auth0Id);
    return this.prisma.pet.update({
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
