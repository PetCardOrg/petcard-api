import { UnauthorizedException } from '@nestjs/common';
import { CardController } from '../card.controller';
import { CardService } from '../card.service';

describe('CardController', () => {
  let controller: CardController;
  let cardService: { generateQrCode: jest.Mock };

  beforeEach(() => {
    cardService = { generateQrCode: jest.fn() };
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
    expect((res as { send: jest.Mock }).send).toHaveBeenCalledWith(fakeBuffer);
  });

  it('should throw UnauthorizedException when authorization header is missing', async () => {
    const { req, res } = createMockReqRes(undefined);

    await expect(controller.getQrCode(req, res)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
