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
import { CreatePetDto, PetResponseDto, UpdatePetDto } from '@petcardorg/shared';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { PetService } from './pet.service';

@ApiTags('pets')
@Controller('pets')
export class PetController {
  constructor(private readonly petService: PetService) {}

  @Post()
  @Auth(Role.TUTOR)
  @ApiOperation({ summary: 'Cadastrar pet do tutor autenticado' })
  @ApiCreatedResponse({ type: PetResponseDto })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePetDto,
  ): Promise<PetResponseDto> {
    return this.petService.create(user.sub, dto);
  }

  @Get()
  @Auth(Role.TUTOR)
  @ApiOperation({ summary: 'Listar pets do tutor autenticado' })
  @ApiOkResponse({ type: PetResponseDto, isArray: true })
  async findAll(@CurrentUser() user: JwtPayload): Promise<PetResponseDto[]> {
    return this.petService.findAllForTutor(user.sub);
  }

  @Get(':id')
  @Auth(Role.TUTOR, Role.VET)
  @ApiOperation({ summary: 'Buscar pet por id (tutor dono ou vet)' })
  @ApiOkResponse({ type: PetResponseDto })
  @ApiNotFoundResponse({ description: 'Pet não encontrado' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<PetResponseDto> {
    const isVet = user.role === Role.VET;
    return this.petService.findOne(id, user.sub, isVet);
  }

  @Patch(':id')
  @Auth(Role.TUTOR)
  @ApiOperation({ summary: 'Atualizar pet do tutor autenticado' })
  @ApiOkResponse({ type: PetResponseDto })
  @ApiNotFoundResponse({ description: 'Pet não encontrado' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdatePetDto,
  ): Promise<PetResponseDto> {
    return this.petService.update(id, user.sub, dto);
  }

  @Delete(':id')
  @Auth(Role.TUTOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover pet do tutor autenticado' })
  @ApiNotFoundResponse({ description: 'Pet não encontrado' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.petService.remove(id, user.sub);
  }

  @Post(':id/qr-code')
  @Auth(Role.TUTOR)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Reenfileirar geração do QR Code da carteira (assíncrono)',
    description:
      'Troca o token da carteira E o da tag da coleira, invalidando os dois ' +
      'QRs anteriores — inclusive a tag impressa presa no animal. É a única ' +
      'forma real de revogar o acesso de um veterinário à carteira clínica: ' +
      'tirar o pet da lista dele (`DELETE /veterinarios/me/pets/:petId`) não ' +
      'basta enquanto o token antigo continuar válido.',
  })
  @ApiNotFoundResponse({ description: 'Pet não encontrado' })
  async regenerateQrCode(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.petService.regenerateQrCode(id, user.sub);
  }
}
