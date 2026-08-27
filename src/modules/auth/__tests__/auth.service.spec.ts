import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { CrmvVerificationService } from '../../veterinario/crmv/crmv-verification.service';
import { AuthService } from '../auth.service';

// Sem `virtual: true`: bcrypt existe em disco, e marcá-lo como virtual fazia o
// Jest às vezes resolver o módulo real a partir do cache de transform. O hash
// verdadeiro então não batia com a fixture e o login falhava em execuções
// alternadas — a instabilidade da api#107.
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    tutor: { findUnique: jest.Mock; create: jest.Mock };
    veterinario: { findUnique: jest.Mock; create: jest.Mock };
  };
  let jwtService: { sign: jest.Mock };
  let crmvVerification: { parseCrmv: jest.Mock; verify: jest.Mock };

  const tutorFixture = {
    id: 'tutor-1',
    name: 'Alice',
    email: 'alice@example.com',
    password: 'hashed-password',
    phone: '85988887777',
    profileImageUrl: 'https://cdn.petcard.com/tutor-1.jpg',
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
        create: jest.fn(),
      },
    };
    jwtService = { sign: jest.fn().mockReturnValue('jwt-token') };
    crmvVerification = {
      parseCrmv: jest.fn().mockReturnValue({ numero: '12345', uf: 'SP' }),
      verify: jest.fn().mockResolvedValue({ verified: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: CrmvVerificationService, useValue: crmvVerification },
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

    it('inclui phone e profile_image_url na resposta', async () => {
      prisma.tutor.findUnique.mockResolvedValue(null);
      prisma.tutor.create.mockResolvedValue(tutorFixture);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');

      const result = await service.register({
        name: 'Alice',
        email: 'alice@example.com',
        password: '123456',
      });

      expect(result.user.phone).toBe('85988887777');
      expect(result.user.profile_image_url).toBe(
        'https://cdn.petcard.com/tutor-1.jpg',
      );
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

    it('inclui phone e profile_image_url na resposta (regressão: sumiam após logout/login)', async () => {
      prisma.tutor.findUnique.mockResolvedValue(tutorFixture);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        email: 'alice@example.com',
        password: '123456',
      });

      expect(result.user.phone).toBe('85988887777');
      expect(result.user.profile_image_url).toBe(
        'https://cdn.petcard.com/tutor-1.jpg',
      );
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

  describe('registerVeterinario', () => {
    const novoVet = {
      nome: 'Dr. Carlos',
      email: 'carlos@vet.com',
      password: 'senha-forte',
      crmv: 'CRMV-SP 12345',
      telefone: '85999999999',
    };
    const vetCriado = {
      id: 'vet-9',
      nome: 'Dr. Carlos',
      email: 'carlos@vet.com',
      password: 'hashed-password',
      crmv: 'CRMV-SP 12345',
      telefone: '85999999999',
    };

    beforeEach(() => {
      prisma.veterinario.findUnique.mockResolvedValue(null);
      prisma.veterinario.create.mockResolvedValue(vetCriado);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
    });

    it('cria o veterinário, verifica o CRMV e devolve token', async () => {
      const result = await service.registerVeterinario(novoVet);

      expect(result.access_token).toBe('jwt-token');
      expect(result.user.crmv).toBe('CRMV-SP 12345');
      expect(result.user.role).toBe('VET');
      expect(result.crmv_verificado).toBe(true);
      expect(crmvVerification.verify).toHaveBeenCalledWith('vet-9');
    });

    it('não devolve o hash da senha', async () => {
      const result = await service.registerVeterinario(novoVet);

      expect(result.user).not.toHaveProperty('password');
    });

    it('grava a senha cifrada, nunca em texto puro', async () => {
      await service.registerVeterinario(novoVet);

      const [[chamada]] = prisma.veterinario.create.mock.calls as Array<
        [{ data: { password: string } }]
      >;
      expect(chamada.data.password).toBe('hashed-password');
      expect(chamada.data.password).not.toBe('senha-forte');
    });

    it('recusa email já cadastrado (409)', async () => {
      prisma.veterinario.findUnique.mockResolvedValueOnce(vetCriado);

      await expect(service.registerVeterinario(novoVet)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.veterinario.create).not.toHaveBeenCalled();
    });

    it('recusa CRMV já cadastrado (409)', async () => {
      prisma.veterinario.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(vetCriado);

      await expect(service.registerVeterinario(novoVet)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.veterinario.create).not.toHaveBeenCalled();
    });

    it('recusa CRMV mal formatado antes de criar a conta', async () => {
      crmvVerification.parseCrmv.mockImplementation(() => {
        throw new BadRequestException('formato inválido');
      });

      await expect(service.registerVeterinario(novoVet)).rejects.toThrow(
        BadRequestException,
      );
      // Não pode sobrar conta órfã de um CRMV que nunca será verificável.
      expect(prisma.veterinario.create).not.toHaveBeenCalled();
    });

    it('cria a conta mesmo se o provedor de CRMV estiver fora do ar', async () => {
      crmvVerification.verify.mockRejectedValue(
        new Error('provedor indisponível'),
      );

      const result = await service.registerVeterinario(novoVet);

      expect(result.access_token).toBe('jwt-token');
      expect(result.crmv_verificado).toBe(false);
    });

    it('marca como não verificado quando o registro é recusado', async () => {
      crmvVerification.verify.mockResolvedValue({ verified: false });

      const result = await service.registerVeterinario(novoVet);

      expect(result.crmv_verificado).toBe(false);
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
      photoUrl: 'https://cdn.petcard.com/vet-1.jpg',
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

    it('inclui telefone e foto_url na resposta (regressão: sumiam após logout/login)', async () => {
      prisma.veterinario.findUnique.mockResolvedValue(vetFixture);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.loginVeterinario({
        email: 'bob@vet.com',
        password: '123456',
      });

      expect(result.user.telefone).toBe('11999990000');
      expect(result.user.foto_url).toBe('https://cdn.petcard.com/vet-1.jpg');
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
