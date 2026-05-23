import { NotFoundException } from '@nestjs/common';
import { CardController } from '../card.controller';
import { CardService } from '../card.service';

describe('CardController', () => {
  let controller: CardController;
  let cardService: {
    findByPetIdForTutor: jest.Mock;
    findPublicByToken: jest.Mock;
  };

  beforeEach(() => {
    cardService = {
      findByPetIdForTutor: jest.fn(),
      findPublicByToken: jest.fn(),
    };
    controller = new CardController(cardService as unknown as CardService);
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
        sub: 'tutor-1',
      });

      expect(cardService.findByPetIdForTutor).toHaveBeenCalledWith(
        'pet-1',
        'tutor-1',
      );
      expect(result).toBe(dto);
    });
  });
});
