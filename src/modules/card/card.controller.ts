import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  CarteiraDigitalPublicResponseDto,
  CarteiraDigitalResponseDto,
} from '@petcardorg/shared';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { CardService } from './card.service';

@Controller('cards')
export class CardController {
  constructor(private readonly cardService: CardService) {}

  @Get('pets/:petId')
  @Auth(Role.TUTOR)
  async getCardByPetId(
    @Param('petId') petId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<CarteiraDigitalResponseDto> {
    return this.cardService.findByPetIdForTutor(petId, user.sub);
  }

  @Get(':token')
  @UseGuards(ThrottlerGuard)
  @Throttle({ 'public-card': {} })
  async getPublicCard(
    @Param('token') token: string,
  ): Promise<CarteiraDigitalPublicResponseDto> {
    return this.cardService.findPublicByToken(token);
  }
}
