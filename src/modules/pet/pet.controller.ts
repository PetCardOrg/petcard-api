import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Pet } from '@prisma/client';
import { CreatePetDto, UpdatePetDto } from '@petcardorg/shared';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { PetService } from './pet.service';

@Controller('pets')
export class PetController {
  constructor(private readonly petService: PetService) {}

  @Post()
  @Auth(Role.TUTOR)
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePetDto,
  ): Promise<Pet> {
    return this.petService.create(user.sub, dto);
  }

  @Get()
  @Auth(Role.TUTOR)
  async findAll(@CurrentUser() user: JwtPayload): Promise<Pet[]> {
    return this.petService.findAllForTutor(user.sub);
  }

  @Get(':id')
  @Auth(Role.TUTOR, Role.VET)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<Pet> {
    const isVet = user.permissions?.includes(Role.VET) ?? false;
    return this.petService.findOne(id, user.sub, isVet);
  }

  @Patch(':id')
  @Auth(Role.TUTOR)
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdatePetDto,
  ): Promise<Pet> {
    return this.petService.update(id, user.sub, dto);
  }

  @Delete(':id')
  @Auth(Role.TUTOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.petService.remove(id, user.sub);
  }
}
