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
import { CarteiraDigitalPublicResponseDto } from '@petcardorg/shared';
import { Auth } from '../auth/decorators/auth.decorator';
import { Role } from '../auth/enums/role.enum';
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

  @Get(':token')
  @UseGuards(ThrottlerGuard)
  @Throttle({ 'public-card': {} })
  async getPublicCard(
    @Param('token') token: string,
  ): Promise<CarteiraDigitalPublicResponseDto> {
    return this.cardService.findPublicByToken(token);
  }
}
