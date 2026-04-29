import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CardService {
  constructor(private readonly prisma: PrismaService) {}

  async generateQrCode(token: string): Promise<Buffer> {
    const payload = JSON.stringify({
      uuid: randomUUID(),
      token,
    });

    return this.generateBuffer(payload);
  }

  async generatePetQrCode(petId: string): Promise<Buffer> {
    const payload = JSON.stringify({
      uuid: randomUUID(),
      petId,
    });

    return this.generateBuffer(payload);
  }

  async issueTokenForPet(petId: string): Promise<string> {
    const token = randomUUID();
    await this.prisma.carteiraDigital.upsert({
      where: { petId },
      create: { petId, token },
      update: { token },
    });
    return token;
  }

  async setCardQrCodeUrl(petId: string, qrCodeUrl: string): Promise<void> {
    await this.prisma.carteiraDigital.update({
      where: { petId },
      data: { qrCodeUrl },
    });
  }

  private async generateBuffer(data: string): Promise<Buffer> {
    try {
      return await QRCode.toBuffer(data, {
        type: 'png',
        width: 400,
        margin: 2,
        errorCorrectionLevel: 'M',
      });
    } catch {
      throw new InternalServerErrorException('Failed to generate QR Code');
    }
  }
}
