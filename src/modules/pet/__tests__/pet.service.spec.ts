import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Sex, Species } from '@petcardorg/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { QrCodePublisher } from '../../queue/qr-code.publisher';
import { TutorService } from '../../tutor/tutor.service';
import { PetService } from '../pet.service';

describe('PetService', () => {
  let service: PetService;
  let prisma: {
    pet: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    petAtendido: { findUnique: jest.Mock };
  };
  let tutorService: { findById: jest.Mock };
  let qrCodePublisher: { publishGenerate: jest.Mock };

  const tutor = { id: 'tutor-1' };
  const now = new Date('2025-01-15T12:00:00Z');
  const QR_URL = 'https://bucket.s3.us-east-1.amazonaws.com/qr-codes/pet-1.png';
  const pet = {
    id: 'pet-1',
    name: 'Rex',
    species: Species.DOG,
    breed: null,
    sex: Sex.MALE,
    birthDate: new Date('2022-03-10'),
    weight: null,
    photoUrl: null,
    tutorId: 'tutor-1',
    createdAt: now,
    updatedAt: now,
    carteiraDigital: null,
  };
  const petWithCard = {
    ...pet,
    carteiraDigital: {
      id: 'card-1',
      petId: 'pet-1',
      token: 'tok-123',
      qrCodeUrl: QR_URL,
      createdAt: now,
    },
  };

  beforeEach(async () => {
    prisma = {
      pet: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      petAtendido: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    tutorService = { findById: jest.fn().mockResolvedValue(tutor) };
    qrCodePublisher = {
      publishGenerate: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PetService,
        { provide: PrismaService, useValue: prisma },
        { provide: TutorService, useValue: tutorService },
        { provide: QrCodePublisher, useValue: qrCodePublisher },
      ],
    }).compile();

    service = module.get<PetService>(PetService);
  });

  describe('create', () => {
    it('should create a pet linked to the authenticated tutor', async () => {
      prisma.pet.create.mockResolvedValue(pet);
      prisma.pet.findUniqueOrThrow.mockResolvedValue(pet);

      const result = await service.create('tutor-1', {
        name: 'Rex',
        species: Species.DOG,
        sex: Sex.MALE,
      });

      const calls = prisma.pet.create.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      expect(calls[0][0].data).toMatchObject({
        name: 'Rex',
        species: Species.DOG,
        sex: Sex.MALE,
        tutorId: 'tutor-1',
      });
      expect(result).toMatchObject({
        id: 'pet-1',
        name: 'Rex',
        species: Species.DOG,
        sex: Sex.MALE,
        birth_date: '2022-03-10',
        tutor_id: 'tutor-1',
      });
    });

    it('should publish a qr-code.generate message after creating the pet', async () => {
      prisma.pet.create.mockResolvedValue(pet);
      prisma.pet.findUniqueOrThrow.mockResolvedValue(pet);

      const result = await service.create('tutor-1', {
        name: 'Rex',
        species: Species.DOG,
        sex: Sex.MALE,
      });

      expect(qrCodePublisher.publishGenerate).toHaveBeenCalledWith('pet-1');
      expect(result.qr_code_url).toBeUndefined();
    });

    it('should return the created pet even if publishing fails', async () => {
      prisma.pet.create.mockResolvedValue(pet);
      prisma.pet.findUniqueOrThrow.mockResolvedValue(pet);
      qrCodePublisher.publishGenerate.mockRejectedValue(new Error('rmq down'));

      const result = await service.create('tutor-1', {
        name: 'Rex',
        species: Species.DOG,
        sex: Sex.MALE,
      });

      expect(result.id).toBe('pet-1');
      expect(qrCodePublisher.publishGenerate).toHaveBeenCalledWith('pet-1');
    });
  });

  describe('regenerateQrCode', () => {
    it('should publish a qr-code.generate message for an owned pet', async () => {
      prisma.pet.findUnique.mockResolvedValue(pet);

      await service.regenerateQrCode('pet-1', 'tutor-1');

      expect(qrCodePublisher.publishGenerate).toHaveBeenCalledWith('pet-1');
    });

    it('should throw ForbiddenException when another tutor tries to regenerate', async () => {
      prisma.pet.findUnique.mockResolvedValue({
        ...pet,
        tutorId: 'other-tutor',
      });

      await expect(
        service.regenerateQrCode('pet-1', 'tutor-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(qrCodePublisher.publishGenerate).not.toHaveBeenCalled();
    });
  });

  describe('findAllForTutor', () => {
    it('should return only pets owned by the tutor', async () => {
      prisma.pet.findMany.mockResolvedValue([petWithCard]);

      const result = await service.findAllForTutor('tutor-1');

      expect(prisma.pet.findMany).toHaveBeenCalledWith({
        where: { tutorId: 'tutor-1' },
        include: { carteiraDigital: true },
      });
      expect(result[0]).toMatchObject({
        id: 'pet-1',
        name: 'Rex',
        qr_code_url: QR_URL,
      });
    });
  });

  describe('findOne', () => {
    it('should allow the owner to read a pet', async () => {
      prisma.pet.findUnique.mockResolvedValue(petWithCard);

      const result = await service.findOne('pet-1', 'tutor-1', false);

      expect(prisma.pet.findUnique).toHaveBeenCalledWith({
        where: { id: 'pet-1' },
        include: { carteiraDigital: true },
      });
      expect(result).toMatchObject({
        id: 'pet-1',
        name: 'Rex',
        qr_code_url: QR_URL,
      });
    });

    it('should deny access to non-owner tutors', async () => {
      prisma.pet.findUnique.mockResolvedValue({
        ...petWithCard,
        tutorId: 'other',
      });

      await expect(service.findOne('pet-1', 'tutor-1', false)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('libera o vet que tem o pet na lista de atendidos', async () => {
      prisma.pet.findUnique.mockResolvedValue({
        ...petWithCard,
        tutorId: 'other',
      });
      prisma.petAtendido.findUnique.mockResolvedValue({ id: 'vinculo-1' });

      const result = await service.findOne('pet-1', 'vet-1', true);

      expect(result.id).toBe('pet-1');
      expect(prisma.petAtendido.findUnique).toHaveBeenCalledWith({
        where: {
          veterinarioId_petId: { veterinarioId: 'vet-1', petId: 'pet-1' },
        },
      });
    });

    it('barra o vet sem vínculo com o pet', async () => {
      prisma.pet.findUnique.mockResolvedValue({
        ...petWithCard,
        tutorId: 'other',
      });
      prisma.petAtendido.findUnique.mockResolvedValue(null);

      await expect(service.findOne('pet-1', 'vet-1', true)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException when the pet is missing', async () => {
      prisma.pet.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne('missing', 'tutor-1', false),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update owned pets', async () => {
      prisma.pet.findUnique.mockResolvedValue(pet);
      prisma.pet.update.mockResolvedValue({
        ...petWithCard,
        name: 'Rex II',
      });

      const result = await service.update('pet-1', 'tutor-1', {
        name: 'Rex II',
      });

      expect(prisma.pet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pet-1' },
          include: { carteiraDigital: true },
        }),
      );
      expect(result.name).toBe('Rex II');
    });

    it('should refuse updates from non-owners', async () => {
      prisma.pet.findUnique.mockResolvedValue({ ...pet, tutorId: 'other' });

      await expect(
        service.update('pet-1', 'tutor-1', { name: 'Rex II' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should delete owned pets', async () => {
      prisma.pet.findUnique.mockResolvedValue(pet);
      prisma.pet.delete.mockResolvedValue(pet);

      await service.remove('pet-1', 'tutor-1');

      expect(prisma.pet.delete).toHaveBeenCalledWith({
        where: { id: 'pet-1' },
      });
    });
  });

  describe('assertAccess', () => {
    // Ponto único por onde passam vacina, vermífugo, medicação e histórico.
    it('devolve o pet para o tutor dono', async () => {
      prisma.pet.findUnique.mockResolvedValue(pet);

      await expect(
        service.assertAccess('pet-1', 'tutor-1', false),
      ).resolves.toMatchObject({ id: 'pet-1' });
      expect(prisma.petAtendido.findUnique).not.toHaveBeenCalled();
    });

    it('barra o tutor que não é dono', async () => {
      prisma.pet.findUnique.mockResolvedValue({ ...pet, tutorId: 'outro' });

      await expect(
        service.assertAccess('pet-1', 'tutor-1', false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('devolve o pet para o vet que o atende', async () => {
      prisma.pet.findUnique.mockResolvedValue({ ...pet, tutorId: 'outro' });
      prisma.petAtendido.findUnique.mockResolvedValue({ id: 'vinculo-1' });

      await expect(
        service.assertAccess('pet-1', 'vet-1', true),
      ).resolves.toMatchObject({ id: 'pet-1' });
    });

    it('barra o vet sem vínculo, ainda que o pet exista', async () => {
      // O buraco que isto fecha: com o id do pet em mãos, qualquer vet
      // verificado lia e escrevia no prontuário de qualquer animal da base.
      prisma.pet.findUnique.mockResolvedValue({ ...pet, tutorId: 'outro' });
      prisma.petAtendido.findUnique.mockResolvedValue(null);

      await expect(
        service.assertAccess('pet-1', 'vet-1', true),
      ).rejects.toThrow(ForbiddenException);
    });

    it('devolve 404 para pet inexistente, mesmo para vet', async () => {
      prisma.pet.findUnique.mockResolvedValue(null);

      await expect(
        service.assertAccess('missing', 'vet-1', true),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
