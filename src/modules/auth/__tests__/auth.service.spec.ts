import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthService } from '../auth.service';

jest.mock(
  'bcrypt',
  () => ({
    hash: jest.fn(),
    compare: jest.fn(),
  }),
  { virtual: true },
);

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    tutor: { findUnique: jest.Mock; create: jest.Mock };
    veterinario: { findUnique: jest.Mock };
  };
  let jwtService: { sign: jest.Mock };

  const tutorFixture = {
    id: 'tutor-1',
    name: 'Alice',
    email: 'alice@example.com',
    password: 'hashed-password',
    role: 'TUTOR',
  };

  beforeEach(async () => {
    prisma = {
      tutor: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      veterinario: {
        findUnique: jest.fn(),
      },
    };
    jwtService = { sign: jest.fn().mockReturnValue('jwt-token') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('should create a tutor and return token', async () => {
      prisma.tutor.findUnique.mockResolvedValue(null);
      prisma.tutor.create.mockResolvedValue(tutorFixture);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');

      const result = await service.register({
        name: 'Alice',
        email: 'alice@example.com',
        password: '123456',
      });

      expect(result.access_token).toBe('jwt-token');
      expect(result.user.email).toBe('alice@example.com');
    });

    it('should throw ConflictException if email exists', async () => {
      prisma.tutor.findUnique.mockResolvedValue(tutorFixture);

      await expect(
        service.register({
          name: 'Alice',
          email: 'alice@example.com',
          password: '123456',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should return token for valid credentials', async () => {
      prisma.tutor.findUnique.mockResolvedValue(tutorFixture);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        email: 'alice@example.com',
        password: '123456',
      });

      expect(result.access_token).toBe('jwt-token');
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      prisma.tutor.findUnique.mockResolvedValue(tutorFixture);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: 'alice@example.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for unknown email', async () => {
      prisma.tutor.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'unknown@example.com', password: '123456' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('loginVeterinario', () => {
    const vetFixture = {
      id: 'vet-1',
      nome: 'Dr. Bob',
      email: 'bob@vet.com',
      password: 'hashed-password',
      crmv: 'CRMV-SP-12345',
      telefone: '11999990000',
    };

    it('should return token for valid vet credentials', async () => {
      prisma.veterinario.findUnique.mockResolvedValue(vetFixture);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.loginVeterinario({
        email: 'bob@vet.com',
        password: '123456',
      });

      expect(result.access_token).toBe('jwt-token');
      expect(result.user.nome).toBe('Dr. Bob');
      expect(result.user.crmv).toBe('CRMV-SP-12345');
      expect(result.user.role).toBe('VET');
    });

    it('should throw UnauthorizedException for unknown vet email', async () => {
      prisma.veterinario.findUnique.mockResolvedValue(null);

      await expect(
        service.loginVeterinario({
          email: 'unknown@vet.com',
          password: '123456',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for wrong vet password', async () => {
      prisma.veterinario.findUnique.mockResolvedValue(vetFixture);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.loginVeterinario({ email: 'bob@vet.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getVeterinarioProfile', () => {
    const vetFixture = {
      id: 'vet-1',
      nome: 'Dr. Bob',
      email: 'bob@vet.com',
      password: 'hashed-password',
      crmv: 'CRMV-SP-12345',
      telefone: '11999990000',
    };

    it('should return vet profile without password', async () => {
      prisma.veterinario.findUnique.mockResolvedValue(vetFixture);

      const result = await service.getVeterinarioProfile('vet-1');

      expect(result.id).toBe('vet-1');
      expect(result.nome).toBe('Dr. Bob');
      expect(result.crmv).toBe('CRMV-SP-12345');
      expect(result.telefone).toBe('11999990000');
      expect(result.role).toBe('VET');
      expect(result).not.toHaveProperty('password');
    });

    it('should throw UnauthorizedException if vet not found', async () => {
      prisma.veterinario.findUnique.mockResolvedValue(null);

      await expect(
        service.getVeterinarioProfile('nonexistent'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
