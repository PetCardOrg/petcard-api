import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import {
  CreateNotaClinicaDto,
  NotaClinicaResponseDto,
} from '@petcardorg/shared';
import { VetNoteService } from './vet-note.service';

@Controller()
export class VetNoteController {
  constructor(private readonly vetNoteService: VetNoteService) {}

  @Post('pets/:petId/clinical-notes')
  @Auth(Role.VET)
  async create(
    @Param('petId') petId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateNotaClinicaDto,
  ): Promise<NotaClinicaResponseDto> {
    return this.vetNoteService.create(petId, user.sub, dto);
  }

  @Get('pets/:petId/clinical-notes')
  @Auth(Role.TUTOR, Role.VET)
  async findAllForPet(
    @Param('petId') petId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<NotaClinicaResponseDto[]> {
    const isVet = user.role === Role.VET;
    return this.vetNoteService.findAllForPet(petId, user.sub, isVet);
  }

  @Get('clinical-notes/:id')
  @Auth(Role.TUTOR, Role.VET)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<NotaClinicaResponseDto> {
    const isVet = user.role === Role.VET;
    return this.vetNoteService.findOne(id, user.sub, isVet);
  }

  @Delete('clinical-notes/:id')
  @Auth(Role.VET)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.vetNoteService.remove(id, user.sub);
  }
}
