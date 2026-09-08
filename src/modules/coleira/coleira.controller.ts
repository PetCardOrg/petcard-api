import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Role } from '../auth/enums/role.enum';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ColeiraService } from './coleira.service';
import { ColeiraPublicResponseDto } from './dto/coleira-public-response.dto';
import { PetScanResponseDto } from './dto/pet-scan-response.dto';
import { TagColeiraResponseDto } from './dto/tag-coleira-response.dto';
import { RegistrarLeituraDto } from './dto/registrar-leitura.dto';

@ApiTags('coleira')
@Controller('coleira')
export class ColeiraController {
  constructor(private readonly coleiraService: ColeiraService) {}

  // Antes do `@Get(':token')`, que é catch-all e engoliria este caminho.
  @Get('pets/:petId/scans')
  @Auth(Role.TUTOR)
  @ApiOperation({
    summary: 'Leituras do QR da coleira do pet (visão do tutor dono)',
    description:
      'Histórico de quem encontrou o pet, da leitura mais recente para a mais ' +
      'antiga (últimas 100). Coordenadas só aparecem quando quem escaneou ' +
      'consentiu.',
  })
  @ApiOkResponse({ type: PetScanResponseDto, isArray: true })
  @ApiNotFoundResponse({ description: 'Pet não encontrado' })
  async getPetScans(
    @Param('petId') petId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<PetScanResponseDto[]> {
    return this.coleiraService.listScansForTutor(petId, user.sub);
  }

  @Get('pets/:petId/tag')
  @Auth(Role.TUTOR)
  @ApiOperation({ summary: 'QR da coleira do pet (visão do tutor dono)' })
  @ApiOkResponse({ type: TagColeiraResponseDto })
  @ApiNotFoundResponse({ description: 'Tag da coleira não encontrada' })
  async getTag(
    @Param('petId') petId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<TagColeiraResponseDto> {
    return this.coleiraService.findTagForTutor(petId, user.sub);
  }

  @Post(':token/leitura')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ 'public-card': {} })
  @SkipThrottle({ auth: true })
  @ApiOperation({
    summary: 'Registrar que alguém encontrou o pet (sem autenticação)',
    description:
      'Disparado ao abrir a página do achador. A localização é opcional: sem ' +
      'ela o tutor ainda é avisado de que o pet foi encontrado.',
  })
  @ApiCreatedResponse({ type: PetScanResponseDto })
  @ApiNotFoundResponse({ description: 'Tag da coleira não encontrada' })
  @ApiTooManyRequestsResponse({ description: 'Limite de requisições excedido' })
  async registrarLeitura(
    @Param('token') token: string,
    @Body() dto: RegistrarLeituraDto,
  ): Promise<PetScanResponseDto> {
    return this.coleiraService.registrarLeitura(token, dto);
  }

  @Get(':token')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ 'public-card': {} })
  @SkipThrottle({ auth: true })
  @ApiOperation({
    summary: 'Dados do pet para quem encontrou (sem autenticação)',
    description:
      'Só o que ajuda a devolver o animal: identificação do pet e contato do ' +
      'tutor. Não expõe histórico clínico — para isso existe a carteira ' +
      'digital, com token e público próprios.',
  })
  @ApiOkResponse({ type: ColeiraPublicResponseDto })
  @ApiNotFoundResponse({ description: 'Tag da coleira não encontrada' })
  @ApiTooManyRequestsResponse({ description: 'Limite de requisições excedido' })
  async getPublic(
    @Param('token') token: string,
  ): Promise<ColeiraPublicResponseDto> {
    return this.coleiraService.findPublicByToken(token);
  }
}
