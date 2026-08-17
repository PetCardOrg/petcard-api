import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
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
