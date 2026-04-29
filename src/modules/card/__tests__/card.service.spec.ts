import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as QRCode from 'qrcode';
import { Sex, Species } from '@petcardorg/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { CardService } from '../card.service';

jest.mock('qrcode');

describe('CardService', () => {
  let service: CardService;
  let prisma: {
    carteiraDigital: {
      upsert: jest.Mock;
      update: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let configService: { get: jest.Mock };
  const mockedQRCode = jest.mocked(QRCode);

  beforeEach(async () => {
    prisma = {
      carteiraDigital: {
        upsert: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    configService = {
      get: jest.fn().mockReturnValue('https://card.petcard.app'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<CardService>(CardService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generateQrCode', () => {
    it('should encode the public card URL using PUBLIC_CARD_BASE_URL + token', async () => {
      const fakeBuffer = Buffer.from('fake-png');
      mockedQRCode.toBuffer.mockResolvedValue(fakeBuffer as never);

      const result = await service.generateQrCode('tok-abc');

      expect(result).toBe(fakeBuffer);
      expect(mockedQRCode.toBuffer).toHaveBeenCalledWith(
        'https://card.petcard.app/tok-abc',
        expect.objectContaining({ type: 'png' }),
      );
    });

    it('should strip trailing slashes from the configured base URL', async () => {
      configService.get.mockReturnValue('https://card.petcard.app/');
      mockedQRCode.toBuffer.mockResolvedValue(Buffer.from('x') as never);

      await service.generateQrCode('tok-xyz');

      expect(mockedQRCode.toBuffer).toHaveBeenCalledWith(
        'https://card.petcard.app/tok-xyz',
        expect.any(Object),
      );
    });

    it('should throw InternalServerErrorException when QRCode generation fails', async () => {
      mockedQRCode.toBuffer.mockRejectedValue(new Error('QR fail') as never);

      await expect(service.generateQrCode('token')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('issueTokenForPet', () => {
    it('should upsert carteira_digital with a new uuid token', async () => {
      prisma.carteiraDigital.upsert.mockResolvedValue({});

      const token = await service.issueTokenForPet('pet-1');

      expect(token).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(prisma.carteiraDigital.upsert).toHaveBeenCalledWith({
        where: { petId: 'pet-1' },
        create: { petId: 'pet-1', token },
        update: { token },
      });
    });

    it('should rotate token on subsequent calls for the same pet', async () => {
      prisma.carteiraDigital.upsert.mockResolvedValue({});

      const t1 = await service.issueTokenForPet('pet-1');
      const t2 = await service.issueTokenForPet('pet-1');

      expect(t1).not.toBe(t2);
    });
  });

  describe('setCardQrCodeUrl', () => {
    it('should update carteira_digital qr_code_url', async () => {
      prisma.carteiraDigital.update.mockResolvedValue({});

      await service.setCardQrCodeUrl('pet-1', 'https://s3/qr.png');

      expect(prisma.carteiraDigital.update).toHaveBeenCalledWith({
        where: { petId: 'pet-1' },
        data: { qrCodeUrl: 'https://s3/qr.png' },
      });
    });
  });

  describe('findPublicByToken', () => {
    const baseDate = new Date('2026-04-01T10:00:00Z');

    function makeCard(overrides: Record<string, unknown> = {}) {
      return {
        id: 'card-1',
        petId: 'pet-1',
        token: 'tok-abc',
        qrCodeUrl: 'https://s3/qr.png',
        createdAt: baseDate,
        pet: {
          id: 'pet-1',
          name: 'Rex',
          species: Species.DOG,
          breed: 'Labrador',
          sex: Sex.MALE,
          birthDate: new Date('2022-03-10'),
          weight: 12.5,
          photoUrl: 'https://s3/pet.png',
          tutor: { name: 'Alice' },
          vaccineRecords: [
            {
              id: 'v1',
              petId: 'pet-1',
              vaccineName: 'V8',
              appliedAt: baseDate,
              nextDoseAt: null,
              veterinarianName: null,
              notes: null,
              createdAt: baseDate,
              updatedAt: baseDate,
            },
          ],
          dewormingRecords: [],
          medicationRecords: [],
        },
        ...overrides,
      };
    }

    it('should return the public card data', async () => {
      prisma.carteiraDigital.findUnique.mockResolvedValue(makeCard());

      const result = await service.findPublicByToken('tok-abc');

      expect(prisma.carteiraDigital.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { token: 'tok-abc' } }),
      );
      expect(result).toMatchObject({
        pet_id: 'pet-1',
        pet_name: 'Rex',
        species: Species.DOG,
        sex: Sex.MALE,
        birth_date: '2022-03-10',
        weight: 12.5,
        tutor_name: 'Alice',
        qr_code_url: 'https://s3/qr.png',
      });
      expect(result.vaccines).toHaveLength(1);
      expect(result.vaccines[0]).toMatchObject({
        id: 'v1',
        vaccine_name: 'V8',
      });
    });

    it('should throw NotFoundException for invalid token', async () => {
      prisma.carteiraDigital.findUnique.mockResolvedValue(null);

      await expect(service.findPublicByToken('bad')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
