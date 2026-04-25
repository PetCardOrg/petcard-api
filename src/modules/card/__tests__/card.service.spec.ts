import { InternalServerErrorException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as QRCode from 'qrcode';
import { CardService } from '../card.service';

jest.mock('qrcode');

describe('CardService', () => {
  let service: CardService;
  const mockedQRCode = jest.mocked(QRCode);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CardService],
    }).compile();

    service = module.get<CardService>(CardService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generateQrCode', () => {
    it('should return a PNG buffer with uuid and token in the payload', async () => {
      const fakeBuffer = Buffer.from('fake-png');
      mockedQRCode.toBuffer.mockResolvedValue(fakeBuffer as never);

      const result = await service.generateQrCode('my-jwt-token');

      expect(result).toBe(fakeBuffer);
      expect(mockedQRCode.toBuffer).toHaveBeenCalledTimes(1);

      const call = mockedQRCode.toBuffer.mock.calls[0] as unknown as [
        string,
        unknown,
      ];
      const payload = JSON.parse(call[0]) as { uuid: string; token: string };
      expect(payload).toHaveProperty('uuid');
      expect(payload.uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(payload.token).toBe('my-jwt-token');
    });

    it('should generate a unique uuid on each call', async () => {
      const fakeBuffer = Buffer.from('fake-png');
      mockedQRCode.toBuffer.mockResolvedValue(fakeBuffer as never);

      await service.generateQrCode('token-1');
      await service.generateQrCode('token-2');

      const calls = mockedQRCode.toBuffer.mock.calls as unknown as [
        string,
        unknown,
      ][];
      const uuid1 = (JSON.parse(calls[0][0]) as { uuid: string }).uuid;
      const uuid2 = (JSON.parse(calls[1][0]) as { uuid: string }).uuid;
      expect(uuid1).not.toBe(uuid2);
    });

    it('should throw InternalServerErrorException when QRCode generation fails', async () => {
      mockedQRCode.toBuffer.mockRejectedValue(new Error('QR fail') as never);

      await expect(service.generateQrCode('token')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('generatePetQrCode', () => {
    it('should return a PNG buffer with uuid and petId in the payload', async () => {
      const fakeBuffer = Buffer.from('fake-png');
      mockedQRCode.toBuffer.mockResolvedValue(fakeBuffer as never);

      const result = await service.generatePetQrCode('pet-123');

      expect(result).toBe(fakeBuffer);

      const callIndex = mockedQRCode.toBuffer.mock.calls.length - 1;
      const call = mockedQRCode.toBuffer.mock.calls[callIndex] as unknown as [
        string,
        unknown,
      ];
      const payload = JSON.parse(call[0]) as { uuid: string; petId: string };
      expect(payload).toHaveProperty('uuid');
      expect(payload.uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(payload.petId).toBe('pet-123');
    });

    it('should throw InternalServerErrorException when QRCode generation fails', async () => {
      mockedQRCode.toBuffer.mockRejectedValue(new Error('QR fail') as never);

      await expect(service.generatePetQrCode('pet-123')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
