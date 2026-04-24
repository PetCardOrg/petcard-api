import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Sex, Species } from '@petcardorg/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { TutorService } from '../../tutor/tutor.service';
import { PetService } from '../pet.service';

describe('PetService', () => {
  let service: PetService;
  let prisma: {
    pet: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let tutorService: { findByAuth0Id: jest.Mock };

  const tutor = { id: 'tutor-1', auth0Id: 'auth0|abc' };
  const now = new Date('2025-01-15T12:00:00Z');
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
  };

  beforeEach(async () => {
    prisma = {
      pet: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    tutorService = { findByAuth0Id: jest.fn().mockResolvedValue(tutor) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PetService,
        { provide: PrismaService, useValue: prisma },
        { provide: TutorService, useValue: tutorService },
      ],
    }).compile();

    service = module.get<PetService>(PetService);
  });

  describe('create', () => {
    it('should create a pet linked to the authenticated tutor', async () => {
      prisma.pet.create.mockResolvedValue(pet);

      const result = await service.create('auth0|abc', {
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
  });

  describe('findAllForTutor', () => {
    it('should return only pets owned by the tutor', async () => {
      prisma.pet.findMany.mockResolvedValue([pet]);

      const result = await service.findAllForTutor('auth0|abc');

      expect(prisma.pet.findMany).toHaveBeenCalledWith({
        where: { tutorId: 'tutor-1' },
      });
      expect(result[0]).toMatchObject({ id: 'pet-1', name: 'Rex' });
    });
  });

  describe('findOne', () => {
    it('should allow the owner to read a pet', async () => {
      prisma.pet.findUnique.mockResolvedValue(pet);

      const result = await service.findOne('pet-1', 'auth0|abc', false);

      expect(result).toMatchObject({ id: 'pet-1', name: 'Rex' });
    });

    it('should deny access to non-owner tutors', async () => {
      prisma.pet.findUnique.mockResolvedValue({
        ...pet,
        tutorId: 'other',
      });

      await expect(
        service.findOne('pet-1', 'auth0|abc', false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow any vet to read the pet', async () => {
      prisma.pet.findUnique.mockResolvedValue({
        ...pet,
        tutorId: 'other',
      });

      const result = await service.findOne('pet-1', 'auth0|vet', true);

      expect(result.id).toBe('pet-1');
      expect(tutorService.findByAuth0Id).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when the pet is missing', async () => {
      prisma.pet.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne('missing', 'auth0|abc', false),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update owned pets', async () => {
      prisma.pet.findUnique.mockResolvedValue(pet);
      prisma.pet.update.mockResolvedValue({
        ...pet,
        name: 'Rex II',
      });

      const result = await service.update('pet-1', 'auth0|abc', {
        name: 'Rex II',
      });

      expect(result.name).toBe('Rex II');
    });

    it('should refuse updates from non-owners', async () => {
      prisma.pet.findUnique.mockResolvedValue({ ...pet, tutorId: 'other' });

      await expect(
        service.update('pet-1', 'auth0|abc', { name: 'Rex II' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should delete owned pets', async () => {
      prisma.pet.findUnique.mockResolvedValue(pet);
      prisma.pet.delete.mockResolvedValue(pet);

      await service.remove('pet-1', 'auth0|abc');

      expect(prisma.pet.delete).toHaveBeenCalledWith({
        where: { id: 'pet-1' },
      });
    });
  });
});
