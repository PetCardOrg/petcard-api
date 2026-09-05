import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import {
  CarteiraDigitalClinicaResponseDto,
  CarteiraDigitalPublicResponseDto,
  CarteiraDigitalResponseDto,
} from '@petcardorg/shared';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Role } from '../auth/enums/role.enum';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { AuthCrmvVerificado } from '../veterinario/crmv/auth-crmv.decorator';
import { CardService } from './card.service';
import { PetScanResponseDto } from './dto/pet-scan-response.dto';
import { RegisterScanDto } from './dto/register-scan.dto';

@ApiTags('cards')
@Controller('cards')
export class CardController {
  constructor(private readonly cardService: CardService) {}

  @Get('pets/:petId')
  @Auth(Role.TUTOR)
  @ApiOperation({ summary: 'Carteira digital do pet (visão do tutor dono)' })
  @ApiOkResponse({ type: CarteiraDigitalResponseDto })
  @ApiNotFoundResponse({ description: 'Pet não encontrado' })
  async getCardByPetId(
    @Param('petId') petId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<CarteiraDigitalResponseDto> {
    return this.cardService.findByPetIdForTutor(petId, user.sub);
  }

  // Antes do `@Get(':token')`: aquele é catch-all e engoliria este caminho.
  @Get('pets/:petId/scans')
  @Auth(Role.TUTOR)
  @ApiOperation({
    summary: 'Leituras do QR da coleira do pet (visão do tutor dono)',
    description:
      'Histórico de quem encontrou o pet, da leitura mais recente para a mais ' +
      'antiga. Coordenadas só aparecem quando quem escaneou consentiu.',
  })
  @ApiOkResponse({ type: PetScanResponseDto, isArray: true })
  @ApiNotFoundResponse({ description: 'Pet não encontrado' })
  async getPetScans(
    @Param('petId') petId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<PetScanResponseDto[]> {
    return this.cardService.listScansForTutor(petId, user.sub);
  }

  @Post(':token/scan')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ 'public-card': {} })
  @SkipThrottle({ auth: true })
  @ApiOperation({
    summary: 'Registrar que alguém encontrou o pet (sem autenticação)',
    description:
      'Chamado por uma ação explícita de quem leu o QR da coleira, não pela ' +
      'abertura da carteira — a mesma página é o caminho do veterinário para ' +
      'o prontuário, e avisar a cada visita viraria ruído. A localização é ' +
      'opcional: sem ela o tutor ainda é avisado de que o pet foi encontrado.',
  })
  @ApiCreatedResponse({ type: PetScanResponseDto })
  @ApiNotFoundResponse({ description: 'Carteira não encontrada' })
  @ApiTooManyRequestsResponse({ description: 'Limite de requisições excedido' })
  async registerScan(
    @Param('token') token: string,
    @Body() dto: RegisterScanDto,
  ): Promise<PetScanResponseDto> {
    return this.cardService.registerScan(token, dto);
  }

  @Get(':token/clinico')
  @AuthCrmvVerificado(Role.VET)
  @ApiOperation({
    summary:
      'Carteira clínica por token do QR (veterinário com CRMV verificado)',
    description:
      'Mesma carteira do QR, acrescida de medicações e notas clínicas — os ' +
      'dados que a carteira pública não expõe. Exige CRMV verificado (api#113).',
  })
  @ApiOkResponse({ type: CarteiraDigitalClinicaResponseDto })
  @ApiForbiddenResponse({ description: 'CRMV não verificado' })
  @ApiNotFoundResponse({ description: 'Carteira não encontrada' })
  async getClinicalCard(
    @Param('token') token: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<CarteiraDigitalClinicaResponseDto> {
    return this.cardService.findClinicaByToken(token, user.sub);
  }

  @Get(':token')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ 'public-card': {} })
  // Pelo mesmo motivo do @SkipThrottle no auth.controller: o guard olharia
  // também o throttler de autenticação.
  @SkipThrottle({ auth: true })
  @ApiOperation({
    summary: 'Carteira pública por token do QR Code (sem autenticação)',
  })
  @ApiOkResponse({ type: CarteiraDigitalPublicResponseDto })
  @ApiNotFoundResponse({ description: 'Carteira não encontrada' })
  @ApiTooManyRequestsResponse({ description: 'Limite de requisições excedido' })
  async getPublicCard(
    @Param('token') token: string,
  ): Promise<CarteiraDigitalPublicResponseDto> {
    return this.cardService.findPublicByToken(token);
  }
}
