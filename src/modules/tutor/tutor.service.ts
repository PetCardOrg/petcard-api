import { Injectable, NotFoundException } from '@nestjs/common';
import { Tutor } from '@prisma/client';
import { UpdateTutorDto } from '@petcardorg/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TutorService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Tutor> {
    const tutor = await this.prisma.tutor.findUnique({ where: { id } });
    if (!tutor) {
      throw new NotFoundException(`Tutor with id ${id} not found`);
    }
    return tutor;
  }

  async findByEmail(email: string): Promise<Tutor | null> {
    return this.prisma.tutor.findUnique({ where: { email } });
  }

  async updateById(id: string, data: UpdateTutorDto): Promise<Tutor> {
    await this.findById(id);
    return this.prisma.tutor.update({
      where: { id },
      data,
    });
  }
}
