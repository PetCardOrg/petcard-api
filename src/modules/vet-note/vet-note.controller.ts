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
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { AuthCrmvVerificado } from '../veterinario/crmv/auth-crmv.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import {
  CreateNotaClinicaDto,
  UpdateNotaClinicaDto,
  NotaClinicaResponseDto,
} from '@petcardorg/shared';
import { VetNoteService } from './vet-note.service';

@ApiTags('clinical-notes')
@Controller()
export class VetNoteController {
  constructor(private readonly vetNoteService: VetNoteService) {}

  @Post('pets/:petId/clinical-notes')
  @AuthCrmvVerificado(Role.VET)
  @ApiOperation({
    summary: 'Criar nota clínica no prontuário do pet (escrita reversa do vet)',
  })
  @ApiCreatedResponse({ type: NotaClinicaResponseDto })
  @ApiNotFoundResponse({ description: 'Pet não encontrado' })
  async create(
    @Param('petId') petId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateNotaClinicaDto,
  ): Promise<NotaClinicaResponseDto> {
    return this.vetNoteService.create(petId, user.sub, dto);
  }

  @Get('pets/:petId/clinical-notes')
  @AuthCrmvVerificado(Role.TUTOR, Role.VET)
  @ApiOperation({ summary: 'Listar notas clínicas do pet' })
  @ApiOkResponse({ type: NotaClinicaResponseDto, isArray: true })
  @ApiNotFoundResponse({ description: 'Pet não encontrado' })
  async findAllForPet(
    @Param('petId') petId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<NotaClinicaResponseDto[]> {
    const isVet = user.role === Role.VET;
    return this.vetNoteService.findAllForPet(petId, user.sub, isVet);
  }

  @Get('clinical-notes/:id')
  @Auth(Role.TUTOR, Role.VET)
  @ApiOperation({ summary: 'Buscar nota clínica por id' })
  @ApiOkResponse({ type: NotaClinicaResponseDto })
  @ApiNotFoundResponse({ description: 'Nota clínica não encontrada' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<NotaClinicaResponseDto> {
    const isVet = user.role === Role.VET;
    return this.vetNoteService.findOne(id, user.sub, isVet);
  }

  @Patch('clinical-notes/:id')
  @AuthCrmvVerificado(Role.VET)
  @ApiOperation({ summary: 'Editar nota clínica (somente o vet autor)' })
  @ApiOkResponse({ type: NotaClinicaResponseDto })
  @ApiNotFoundResponse({ description: 'Nota clínica não encontrada' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateNotaClinicaDto,
  ): Promise<NotaClinicaResponseDto> {
    return this.vetNoteService.update(id, user.sub, dto);
  }

  @Delete('clinical-notes/:id')
  @Auth(Role.VET)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover nota clínica (somente o vet autor)' })
  @ApiNotFoundResponse({ description: 'Nota clínica não encontrada' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.vetNoteService.remove(id, user.sub);
  }
}
