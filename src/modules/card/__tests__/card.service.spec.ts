import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as QRCode from 'qrcode';
import { Sex, Species } from '@petcardorg/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { TutorService } from '../../tutor/tutor.service';
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
    pet: {
      findUnique: jest.Mock;
    };
  };
  let configService: { get: jest.Mock };
  let tutorService: { findByAuth0Id: jest.Mock };
  const mockedQRCode = jest.mocked(QRCode);

  beforeEach(async () => {
    prisma = {
      carteiraDigital: {
        upsert: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      pet: {
        findUnique: jest.fn(),
      },
    };
    configService = {
      get: jest.fn().mockReturnValue('https://card.petcard.app'),
    };
    tutorService = {
      findByAuth0Id: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
        { provide: TutorService, useValue: tutorService },
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

  describe('findByPetIdForTutor', () => {
    const baseDate = new Date('2026-04-01T10:00:00Z');

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-04-01T00:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return the authenticated card summary for the owner', async () => {
      tutorService.findByAuth0Id.mockResolvedValue({ id: 'tutor-1' });
      prisma.pet.findUnique.mockResolvedValue({
        id: 'pet-1',
        name: 'Rex',
        species: Species.DOG,
        breed: 'Labrador',
        sex: Sex.MALE,
        birthDate: new Date('2022-03-10'),
        weight: 12.5,
        photoUrl: 'https://s3/pet.png',
        tutorId: 'tutor-1',
        tutor: { id: 'tutor-1', name: 'Alice' },
        carteiraDigital: {
          id: 'card-1',
          petId: 'pet-1',
          token: 'tok-abc',
          qrCodeUrl: 'https://s3/qr.png',
          createdAt: baseDate,
        },
        vaccineRecords: [
          { nextDoseAt: new Date('2026-05-10T00:00:00Z') },
          { nextDoseAt: null },
        ],
        dewormingRecords: [{ nextDoseAt: new Date('2026-05-12T00:00:00Z') }],
        medicationRecords: [
          { endDate: new Date('2026-05-15T00:00:00Z') },
          { endDate: null },
          { endDate: new Date('2026-03-15T00:00:00Z') },
        ],
      });

      const result = await service.findByPetIdForTutor(
        'pet-1',
        'auth0|tutor-1',
      );

      expect(tutorService.findByAuth0Id).toHaveBeenCalledWith('auth0|tutor-1');
      expect(prisma.pet.findUnique).toHaveBeenCalledWith({
        where: { id: 'pet-1' },
        include: {
          tutor: true,
          carteiraDigital: true,
          vaccineRecords: {
            select: {
              nextDoseAt: true,
            },
          },
          dewormingRecords: {
            select: {
              nextDoseAt: true,
            },
          },
          medicationRecords: {
            select: {
              endDate: true,
            },
          },
        },
      });
      expect(result).toMatchObject({
        pet_id: 'pet-1',
        pet_name: 'Rex',
        tutor_id: 'tutor-1',
        tutor_name: 'Alice',
        qr_code_url: 'https://s3/qr.png',
        public_url: 'https://card.petcard.app/tok-abc',
        vaccines_count: 2,
        dewormings_count: 1,
        medications_count: 3,
        upcoming_vaccines_count: 1,
        upcoming_dewormings_count: 1,
        active_medications_count: 2,
        weight: 12.5,
      });
    });

    it('should create the card record when it does not exist yet', async () => {
      tutorService.findByAuth0Id.mockResolvedValue({ id: 'tutor-1' });
      prisma.pet.findUnique.mockResolvedValue({
        id: 'pet-1',
        name: 'Rex',
        species: Species.DOG,
        breed: null,
        sex: Sex.MALE,
        birthDate: null,
        weight: null,
        photoUrl: null,
        tutorId: 'tutor-1',
        tutor: { id: 'tutor-1', name: 'Alice' },
        carteiraDigital: null,
        vaccineRecords: [],
        dewormingRecords: [],
        medicationRecords: [],
      });
      prisma.carteiraDigital.upsert.mockResolvedValue({
        id: 'card-1',
        petId: 'pet-1',
        token: 'tok-abc',
        qrCodeUrl: null,
        createdAt: baseDate,
      });

      const result = await service.findByPetIdForTutor(
        'pet-1',
        'auth0|tutor-1',
      );

      const upsertCalls = prisma.carteiraDigital.upsert.mock.calls as Array<
        [
          {
            create: { petId: string; token: string };
            update: Record<string, never>;
            where: { petId: string };
          },
        ]
      >;
      const upsertPayload = upsertCalls.at(0)?.[0];
      expect(upsertPayload).toBeDefined();
      if (!upsertPayload) {
        throw new Error('Expected carteiraDigital.upsert to be called');
      }
      expect(upsertPayload.where).toEqual({ petId: 'pet-1' });
      expect(upsertPayload.create.petId).toBe('pet-1');
      expect(upsertPayload.update).toEqual({});
      expect(upsertPayload.create.token).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(result.issued_at).toBe(baseDate);
      expect(result.qr_code_url).toBeUndefined();
      expect(result.public_url).toBe('https://card.petcard.app/tok-abc');
    });

    it('should throw NotFoundException when the pet does not exist', async () => {
      tutorService.findByAuth0Id.mockResolvedValue({ id: 'tutor-1' });
      prisma.pet.findUnique.mockResolvedValue(null);

      await expect(
        service.findByPetIdForTutor('missing', 'auth0|tutor-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when the pet belongs to another tutor', async () => {
      tutorService.findByAuth0Id.mockResolvedValue({ id: 'tutor-1' });
      prisma.pet.findUnique.mockResolvedValue({
        id: 'pet-1',
        tutorId: 'tutor-2',
        tutor: { id: 'tutor-2', name: 'Other' },
        carteiraDigital: null,
        vaccineRecords: [],
        dewormingRecords: [],
        medicationRecords: [],
      });

      await expect(
        service.findByPetIdForTutor('pet-1', 'auth0|tutor-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
