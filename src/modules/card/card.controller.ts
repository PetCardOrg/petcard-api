import {
  Controller,
  Get,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
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
}
