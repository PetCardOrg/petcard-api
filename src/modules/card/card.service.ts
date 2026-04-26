import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as QRCode from 'qrcode';

@Injectable()
export class CardService {
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
