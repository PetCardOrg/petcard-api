import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Logger } from '@nestjs/common';
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
    veterinario: { findUnique: jest.Mock };
    medicationRecord: { findMany: jest.Mock };
    notaClinica: { findMany: jest.Mock };
  };
  let configService: { get: jest.Mock };
  let tutorService: { findById: jest.Mock };
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
      veterinario: { findUnique: jest.fn() },
      medicationRecord: { findMany: jest.fn().mockResolvedValue([]) },
      notaClinica: { findMany: jest.fn().mockResolvedValue([]) },
    };
    configService = {
      get: jest.fn().mockReturnValue('https://card.petcard.app'),
    };
    tutorService = {
      findById: jest.fn(),
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
          notasClinicas: [],
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
      // api#114: a carteira pública não expõe medicações nem notas clínicas.
      expect(result.medications).toEqual([]);
      expect(
        (result as Record<string, unknown>).clinical_notes,
      ).toBeUndefined();
    });

    it('should map vaccine/deworming optional fields and withhold sensitive clinical data (api#114)', async () => {
      prisma.carteiraDigital.findUnique.mockResolvedValue(
        makeCard({
          pet: {
            ...makeCard().pet,
            vaccineRecords: [
              {
                id: 'v1',
                petId: 'pet-1',
                vaccineName: 'V8',
                appliedAt: baseDate,
                nextDoseAt: new Date('2026-05-01T10:00:00Z'),
                veterinarianName: 'Dra. Camila',
                notes: 'reforço anual',
                createdAt: baseDate,
                updatedAt: baseDate,
              },
            ],
            dewormingRecords: [
              {
                id: 'd1',
                petId: 'pet-1',
                productName: 'Drontal',
                appliedAt: baseDate,
                nextDoseAt: new Date('2026-07-01T10:00:00Z'),
                veterinarianName: 'Dra. Camila',
                notes: 'dose única',
                createdAt: baseDate,
                updatedAt: baseDate,
              },
            ],
            medicationRecords: [
              {
                id: 'm1',
                petId: 'pet-1',
                medicationName: 'Apoquel',
                dosage: '16mg',
                frequency: '1x ao dia',
                startDate: baseDate,
                endDate: new Date('2026-04-15T10:00:00Z'),
                notes: 'com alimento',
                createdAt: baseDate,
                updatedAt: baseDate,
              },
            ],
            notasClinicas: [
              {
                id: 'n1',
                petId: 'pet-1',
                veterinarioId: 'vet-1',
                veterinario: { nome: 'Camila Ferreira', crmv: 'CRMV-SP 12345' },
                googlePlaceId: 'place-123',
                diagnostico: 'Dermatite',
                prescricao: 'Apoquel 16mg',
                observacoes: 'retorno em 15 dias',
                createdAt: baseDate,
                updatedAt: baseDate,
              },
            ],
          },
        }),
      );

      const result = await service.findPublicByToken('tok-abc');

      expect(result.vaccines[0]).toMatchObject({
        next_dose_at: '2026-05-01T10:00:00.000Z',
        veterinarian_name: 'Dra. Camila',
        notes: 'reforço anual',
      });
      expect(result.dewormings[0]).toMatchObject({
        product_name: 'Drontal',
        next_dose_at: '2026-07-01T10:00:00.000Z',
        veterinarian_name: 'Dra. Camila',
        notes: 'dose única',
      });
      // api#114: mesmo com medicações e notas clínicas presentes no banco, a
      // carteira pública NÃO as expõe — ficam restritas aos endpoints
      // autenticados do tutor/veterinário.
      expect(result.medications).toEqual([]);
      expect(
        (result as Record<string, unknown>).clinical_notes,
      ).toBeUndefined();
    });

    it('should map absent optional fields to undefined', async () => {
      prisma.carteiraDigital.findUnique.mockResolvedValue(
        makeCard({
          qrCodeUrl: null,
          pet: {
            ...makeCard().pet,
            breed: null,
            birthDate: null,
            weight: null,
            photoUrl: null,
            dewormingRecords: [
              {
                id: 'd1',
                petId: 'pet-1',
                productName: 'Drontal',
                appliedAt: baseDate,
                nextDoseAt: null,
                veterinarianName: null,
                notes: null,
                createdAt: baseDate,
                updatedAt: baseDate,
              },
            ],
            medicationRecords: [
              {
                id: 'm1',
                petId: 'pet-1',
                medicationName: 'Apoquel',
                dosage: '16mg',
                frequency: '1x ao dia',
                startDate: baseDate,
                endDate: null,
                notes: null,
                createdAt: baseDate,
                updatedAt: baseDate,
              },
            ],
            notasClinicas: [
              {
                id: 'n1',
                petId: 'pet-1',
                veterinarioId: 'vet-1',
                veterinario: { nome: 'Camila Ferreira', crmv: 'CRMV-SP 12345' },
                googlePlaceId: null,
                diagnostico: 'Dermatite',
                prescricao: null,
                observacoes: null,
                createdAt: baseDate,
                updatedAt: baseDate,
              },
            ],
          },
        }),
      );

      const result = await service.findPublicByToken('tok-abc');

      expect(result.breed).toBeUndefined();
      expect(result.birth_date).toBeUndefined();
      expect(result.weight).toBeUndefined();
      expect(result.photo_url).toBeUndefined();
      expect(result.qr_code_url).toBeUndefined();
      expect(result.dewormings[0]).toMatchObject({
        next_dose_at: undefined,
        veterinarian_name: undefined,
        notes: undefined,
      });
      expect(result.medications).toEqual([]);
    });

    it('should throw NotFoundException for invalid token', async () => {
      prisma.carteiraDigital.findUnique.mockResolvedValue(null);

      await expect(service.findPublicByToken('bad')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findClinicaByToken (api#113)', () => {
    const baseDate = new Date('2026-04-01T10:00:00Z');

    beforeEach(() => {
      prisma.carteiraDigital.findUnique.mockResolvedValue({
        id: 'card-1',
        petId: 'pet-1',
        token: 'tok-abc',
        qrCodeUrl: null,
        createdAt: baseDate,
        pet: {
          id: 'pet-1',
          name: 'Rex',
          species: Species.DOG,
          breed: null,
          sex: Sex.MALE,
          birthDate: null,
          weight: null,
          photoUrl: null,
          tutor: { name: 'Alice' },
          vaccineRecords: [],
          dewormingRecords: [],
        },
      });
      prisma.veterinario.findUnique.mockResolvedValue({
        crmv: 'CRMV-SP 12345',
      });
    });

    it('devolve o que a carteira pública esconde: medicações e notas', async () => {
      prisma.medicationRecord.findMany.mockResolvedValue([
        {
          id: 'm1',
          petId: 'pet-1',
          medicationName: 'Dipirona',
          dosage: '10mg',
          frequency: '8h',
          startDate: baseDate,
          endDate: null,
          notes: null,
          createdAt: baseDate,
          updatedAt: baseDate,
        },
      ]);
      prisma.notaClinica.findMany.mockResolvedValue([
        {
          id: 'n1',
          petId: 'pet-1',
          veterinarioId: 'vet-9',
          googlePlaceId: null,
          diagnostico: 'Otite',
          prescricao: 'Gotas',
          observacoes: null,
          createdAt: baseDate,
          updatedAt: baseDate,
          veterinario: { nome: 'Dra. Camila', crmv: 'CRMV-SP 999' },
        },
      ]);

      const result = await service.findClinicaByToken('tok-abc', 'vet-1');

      expect(result.medications).toHaveLength(1);
      expect(result.medications[0].medication_name).toBe('Dipirona');
      expect(result.clinical_notes).toHaveLength(1);
      expect(result.clinical_notes[0]).toMatchObject({
        diagnostico: 'Otite',
        veterinario_crmv: 'CRMV-SP 999',
      });
    });

    it('registra o CRMV de quem acessou', async () => {
      const result = await service.findClinicaByToken('tok-abc', 'vet-1');

      expect(result.accessed_by_crmv).toBe('CRMV-SP 12345');
    });

    it('mantém os dados da carteira pública', async () => {
      const result = await service.findClinicaByToken('tok-abc', 'vet-1');

      expect(result).toMatchObject({ pet_id: 'pet-1', pet_name: 'Rex' });
    });

    it('propaga 404 quando o token não existe', async () => {
      prisma.carteiraDigital.findUnique.mockResolvedValue(null);

      await expect(
        service.findClinicaByToken('inexistente', 'vet-1'),
      ).rejects.toThrow(NotFoundException);
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
      tutorService.findById.mockResolvedValue({ id: 'tutor-1' });
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

      const result = await service.findByPetIdForTutor('pet-1', 'tutor-1');

      expect(tutorService.findById).toHaveBeenCalledWith('tutor-1');
      expect(prisma.pet.findUnique).toHaveBeenCalledWith({
        where: { id: 'pet-1' },
        include: {
          tutor: true,
          carteiraDigital: true,
          // Registro excluído não conta nos totais da carteira (api#117).
          vaccineRecords: {
            where: { deletedAt: null },
            select: { nextDoseAt: true },
          },
          dewormingRecords: {
            where: { deletedAt: null },
            select: { nextDoseAt: true },
          },
          medicationRecords: {
            where: { deletedAt: null },
            select: { endDate: true },
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
      tutorService.findById.mockResolvedValue({ id: 'tutor-1' });
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

      const result = await service.findByPetIdForTutor('pet-1', 'tutor-1');

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

    it('avisa no boot quando a base do link público não tem hash', () => {
      const aviso = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      // O padrão do repo: base sem "#" costuma ser o dotenv comendo o valor a
      // partir dele, e o link resultante cai no "não encontrado" do HashRouter.
      configService.get.mockReturnValue('https://card.petcard.app');

      service.onModuleInit();

      expect(aviso).toHaveBeenCalledWith(
        expect.stringContaining('PUBLIC_CARD_BASE_URL'),
      );
      aviso.mockRestore();
    });

    it('não avisa quando a base traz o hash', () => {
      const aviso = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      configService.get.mockReturnValue('https://card.petcard.app/#');

      service.onModuleInit();

      expect(aviso).not.toHaveBeenCalled();
      aviso.mockRestore();
    });

    it('should throw NotFoundException when the pet does not exist', async () => {
      tutorService.findById.mockResolvedValue({ id: 'tutor-1' });
      prisma.pet.findUnique.mockResolvedValue(null);

      await expect(
        service.findByPetIdForTutor('missing', 'tutor-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when the pet belongs to another tutor', async () => {
      tutorService.findById.mockResolvedValue({ id: 'tutor-1' });
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
        service.findByPetIdForTutor('pet-1', 'tutor-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
