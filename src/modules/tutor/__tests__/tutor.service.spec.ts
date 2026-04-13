import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { TutorService } from '../tutor.service';

describe('TutorService', () => {
  let service: TutorService;
  let prisma: {
    tutor: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };

  const tutorFixture = {
    id: 'tutor-1',
    auth0Id: 'auth0|123',
    name: 'Alice',
    email: 'alice@example.com',
    phone: null,
    profileImageUrl: null,
    role: 'TUTOR',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      tutor: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TutorService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<TutorService>(TutorService);
  });

  describe('findOrCreate', () => {
    it('should upsert a tutor by auth0Id', async () => {
      prisma.tutor.upsert.mockResolvedValue(tutorFixture);

      const result = await service.findOrCreate(
        'auth0|123',
        'alice@example.com',
        'Alice',
      );

      expect(prisma.tutor.upsert).toHaveBeenCalledWith({
        where: { auth0Id: 'auth0|123' },
        update: {},
        create: {
          auth0Id: 'auth0|123',
          email: 'alice@example.com',
          name: 'Alice',
        },
      });
      expect(result).toBe(tutorFixture);
    });
  });

  describe('findByAuth0Id', () => {
    it('should return the tutor when found', async () => {
      prisma.tutor.findUnique.mockResolvedValue(tutorFixture);

      const result = await service.findByAuth0Id('auth0|123');

      expect(result).toBe(tutorFixture);
    });

    it('should throw NotFoundException when tutor is missing', async () => {
      prisma.tutor.findUnique.mockResolvedValue(null);

      await expect(service.findByAuth0Id('auth0|missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findById', () => {
    it('should throw NotFoundException when tutor is missing', async () => {
      prisma.tutor.findUnique.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateByAuth0Id', () => {
    it('should update the tutor profile', async () => {
      prisma.tutor.findUnique.mockResolvedValue(tutorFixture);
      prisma.tutor.update.mockResolvedValue({
        ...tutorFixture,
        name: 'Alice Updated',
      });

      const result = await service.updateByAuth0Id('auth0|123', {
        name: 'Alice Updated',
      });

      expect(prisma.tutor.update).toHaveBeenCalledWith({
        where: { auth0Id: 'auth0|123' },
        data: { name: 'Alice Updated' },
      });
      expect(result.name).toBe('Alice Updated');
    });
  });
});
