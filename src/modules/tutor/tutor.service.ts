import { Injectable, NotFoundException } from '@nestjs/common';
import { Tutor } from '@prisma/client';
import { UpdateTutorDto } from '@petcardorg/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TutorService {
  constructor(private readonly prisma: PrismaService) {}

  async findOrCreate(
    auth0Id: string,
    email: string,
    name: string,
  ): Promise<Tutor> {
    return this.prisma.tutor.upsert({
      where: { auth0Id },
      update: {},
      create: { auth0Id, email, name },
    });
  }

  async findByAuth0Id(auth0Id: string): Promise<Tutor> {
    const tutor = await this.prisma.tutor.findUnique({ where: { auth0Id } });
    if (!tutor) {
      throw new NotFoundException(`Tutor with auth0Id ${auth0Id} not found`);
    }
    return tutor;
  }

  async findById(id: string): Promise<Tutor> {
    const tutor = await this.prisma.tutor.findUnique({ where: { id } });
    if (!tutor) {
      throw new NotFoundException(`Tutor with id ${id} not found`);
    }
    return tutor;
  }

  async updateByAuth0Id(auth0Id: string, data: UpdateTutorDto): Promise<Tutor> {
    await this.findByAuth0Id(auth0Id);
    return this.prisma.tutor.update({
      where: { auth0Id },
      data,
    });
  }
}
