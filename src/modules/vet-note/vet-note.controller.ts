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
import { CreateVetNoteDto } from './dto/create-vet-note.dto';
import { VetNoteResponseDto, VetNoteService } from './vet-note.service';

@Controller()
export class VetNoteController {
  constructor(private readonly vetNoteService: VetNoteService) {}

  @Post('pets/:petId/clinical-notes')
  @Auth(Role.VET)
  async create(
    @Param('petId') petId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateVetNoteDto,
  ): Promise<VetNoteResponseDto> {
    return this.vetNoteService.create(petId, user.sub, dto);
  }

  @Get('pets/:petId/clinical-notes')
  @Auth(Role.TUTOR, Role.VET)
  async findAllForPet(
    @Param('petId') petId: string,
  ): Promise<VetNoteResponseDto[]> {
    return this.vetNoteService.findAllForPet(petId);
  }

  @Get('clinical-notes/:id')
  @Auth(Role.TUTOR, Role.VET)
  async findOne(@Param('id') id: string): Promise<VetNoteResponseDto> {
    return this.vetNoteService.findOne(id);
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
