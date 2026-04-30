import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
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

  @Get('qr-code')
  @Auth(Role.TUTOR)
  async getQrCode(@Req() req: Request, @Res() res: Response): Promise<void> {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }

    const buffer = await this.cardService.generateQrCode(token);

    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': 'inline; filename="petcard-qr.png"',
      'Cache-Control': 'no-store',
      'Content-Length': buffer.length.toString(),
    });

    res.send(buffer);
  }

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
