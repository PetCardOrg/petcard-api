import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { TutorService } from '../tutor.service';

describe('TutorService', () => {
  let service: TutorService;
  let prisma: {
    tutor: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };

  const tutorFixture = {
    id: 'tutor-1',
    name: 'Alice',
    email: 'alice@example.com',
    password: 'hashed',
    phone: null,
    profileImageUrl: null,
    role: 'TUTOR',
    timezone: 'America/Fortaleza',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      tutor: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TutorService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<TutorService>(TutorService);
  });

  describe('findById', () => {
    it('should return the tutor when found', async () => {
      prisma.tutor.findUnique.mockResolvedValue(tutorFixture);

      const result = await service.findById('tutor-1');

      expect(result).toBe(tutorFixture);
    });

    it('should throw NotFoundException when tutor is missing', async () => {
      prisma.tutor.findUnique.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByEmail', () => {
    it('should return the tutor when found', async () => {
      prisma.tutor.findUnique.mockResolvedValue(tutorFixture);

      const result = await service.findByEmail('alice@example.com');

      expect(result).toBe(tutorFixture);
    });

    it('should return null when not found', async () => {
      prisma.tutor.findUnique.mockResolvedValue(null);

      const result = await service.findByEmail('missing@example.com');

      expect(result).toBeNull();
    });
  });

  describe('updateById', () => {
    it('should update the tutor profile', async () => {
      prisma.tutor.findUnique.mockResolvedValue(tutorFixture);
      prisma.tutor.update.mockResolvedValue({
        ...tutorFixture,
        name: 'Alice Updated',
      });

      const result = await service.updateById('tutor-1', {
        name: 'Alice Updated',
      });

      expect(prisma.tutor.update).toHaveBeenCalledWith({
        where: { id: 'tutor-1' },
        data: { name: 'Alice Updated' },
      });
      expect(result.name).toBe('Alice Updated');
    });
  });
});
