import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { CardController } from '../card.controller';
import { CardService } from '../card.service';

describe('CardController', () => {
  let controller: CardController;
  let cardService: {
    generateQrCode: jest.Mock;
    findByPetIdForTutor: jest.Mock;
    findPublicByToken: jest.Mock;
  };

  beforeEach(() => {
    cardService = {
      generateQrCode: jest.fn(),
      findByPetIdForTutor: jest.fn(),
      findPublicByToken: jest.fn(),
    };
    controller = new CardController(cardService as unknown as CardService);
  });

  function createMockReqRes(authHeader?: string) {
    const req = { headers: { authorization: authHeader } } as never;
    const res = {
      set: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    } as never;
    return { req, res };
  }

  describe('getQrCode', () => {
    it('should return PNG buffer with correct headers', async () => {
      const fakeBuffer = Buffer.from('fake-png');
      cardService.generateQrCode.mockResolvedValue(fakeBuffer);

      const { req, res } = createMockReqRes('Bearer my-jwt-token');
      await controller.getQrCode(req, res);

      expect(cardService.generateQrCode).toHaveBeenCalledWith('my-jwt-token');
      expect((res as { set: jest.Mock }).set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'image/png',
          'Cache-Control': 'no-store',
        }),
      );
      expect((res as { send: jest.Mock }).send).toHaveBeenCalledWith(
        fakeBuffer,
      );
    });

    it('should throw UnauthorizedException when authorization header is missing', async () => {
      const { req, res } = createMockReqRes(undefined);

      await expect(controller.getQrCode(req, res)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('getPublicCard', () => {
    it('should return the public card by token', async () => {
      const dto = { pet_id: 'pet-1', pet_name: 'Rex' };
      cardService.findPublicByToken.mockResolvedValue(dto);

      const result = await controller.getPublicCard('tok-abc');

      expect(cardService.findPublicByToken).toHaveBeenCalledWith('tok-abc');
      expect(result).toBe(dto);
    });

    it('should propagate NotFoundException for invalid tokens', async () => {
      cardService.findPublicByToken.mockRejectedValue(
        new NotFoundException('Carteira digital not found'),
      );

      await expect(controller.getPublicCard('bad')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getCardByPetId', () => {
    it('should return the authenticated card payload for the pet', async () => {
      const dto = { pet_id: 'pet-1', pet_name: 'Rex', vaccines_count: 2 };
      cardService.findByPetIdForTutor.mockResolvedValue(dto);

      const result = await controller.getCardByPetId('pet-1', {
        sub: 'auth0|tutor-1',
      } as never);

      expect(cardService.findByPetIdForTutor).toHaveBeenCalledWith(
        'pet-1',
        'auth0|tutor-1',
      );
      expect(result).toBe(dto);
    });
  });
});
