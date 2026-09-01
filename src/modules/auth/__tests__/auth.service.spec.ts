import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthTokenPurpose } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../../../prisma/prisma.service';
import { CrmvVerificationService } from '../../veterinario/crmv/crmv-verification.service';
import { MailService } from '../../mail/mail.service';
import { AuthTokenService } from '../auth-token.service';
import { AuthService } from '../auth.service';

jest.mock('google-auth-library');

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
    tutor: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    veterinario: { findUnique: jest.Mock; create: jest.Mock };
  };
  let jwtService: { sign: jest.Mock };
  let crmvVerification: { parseCrmv: jest.Mock; verify: jest.Mock };
  let authToken: { issue: jest.Mock; consume: jest.Mock };
  let mail: { sendEmailVerification: jest.Mock; sendPasswordReset: jest.Mock };
  let config: { get: jest.Mock };
  let verifyIdToken: jest.Mock;

  const tutorFixture = {
    id: 'tutor-1',
    name: 'Alice',
    email: 'alice@example.com',
    password: 'hashed-password',
    phone: '85988887777',
    profileImageUrl: 'https://cdn.petcard.com/tutor-1.jpg',
    emailVerifiedAt: null as Date | null,
    googleId: null as string | null,
    role: 'TUTOR',
  };

  beforeEach(async () => {
    prisma = {
      tutor: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
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
    authToken = {
      issue: jest.fn().mockResolvedValue('raw-token'),
      consume: jest.fn().mockResolvedValue('tutor-1'),
    };
    mail = {
      sendEmailVerification: jest.fn().mockResolvedValue(undefined),
      sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    };
    config = {
      get: jest.fn((key: string) =>
        key === 'googleAuth.clientIds' ? ['client-id-web'] : undefined,
      ),
    };
    verifyIdToken = jest.fn();
    (OAuth2Client as unknown as jest.Mock).mockImplementation(() => ({
      verifyIdToken,
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: config },
        { provide: AuthTokenService, useValue: authToken },
        { provide: MailService, useValue: mail },
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

    it('recusa conta só-Google (sem senha) no login por e-mail/senha', async () => {
      prisma.tutor.findUnique.mockResolvedValue({
        ...tutorFixture,
        password: null,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.login({ email: 'alice@example.com', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('expõe email_verified conforme emailVerifiedAt', async () => {
      prisma.tutor.findUnique.mockResolvedValue({
        ...tutorFixture,
        emailVerifiedAt: new Date(),
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        email: 'alice@example.com',
        password: '123456',
      });

      expect(result.user.email_verified).toBe(true);
    });
  });

  describe('register — verificação de e-mail', () => {
    it('dispara o e-mail de verificação e responde email_verified=false', async () => {
      prisma.tutor.findUnique.mockResolvedValue(null);
      prisma.tutor.create.mockResolvedValue(tutorFixture);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');

      const result = await service.register({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'Senha123!',
      });

      expect(authToken.issue).toHaveBeenCalledWith(
        'tutor-1',
        AuthTokenPurpose.EMAIL_VERIFICATION,
      );
      expect(mail.sendEmailVerification).toHaveBeenCalledWith(
        'alice@example.com',
        'raw-token',
      );
      expect(result.user.email_verified).toBe(false);
    });

    it('não derruba o cadastro se o envio de e-mail falhar', async () => {
      prisma.tutor.findUnique.mockResolvedValue(null);
      prisma.tutor.create.mockResolvedValue(tutorFixture);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      mail.sendEmailVerification.mockRejectedValue(new Error('smtp down'));

      const result = await service.register({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'Senha123!',
      });

      expect(result.access_token).toBe('jwt-token');
    });
  });

  describe('forgotPassword', () => {
    it('envia o link quando a conta existe', async () => {
      prisma.tutor.findUnique.mockResolvedValue(tutorFixture);

      await service.forgotPassword({ email: 'alice@example.com' });

      expect(authToken.issue).toHaveBeenCalledWith(
        'tutor-1',
        AuthTokenPurpose.PASSWORD_RESET,
      );
      expect(mail.sendPasswordReset).toHaveBeenCalledWith(
        'alice@example.com',
        'raw-token',
      );
    });

    it('é silenciosa quando a conta não existe (anti-enumeração)', async () => {
      prisma.tutor.findUnique.mockResolvedValue(null);

      await expect(
        service.forgotPassword({ email: 'ninguem@example.com' }),
      ).resolves.toBeUndefined();
      expect(authToken.issue).not.toHaveBeenCalled();
      expect(mail.sendPasswordReset).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('consome o token e grava a nova senha cifrada', async () => {
      authToken.consume.mockResolvedValue('tutor-1');
      (bcrypt.hash as jest.Mock).mockResolvedValue('novo-hash');

      await service.resetPassword({ token: 'raw-token', password: 'Nova123!' });

      expect(authToken.consume).toHaveBeenCalledWith(
        'raw-token',
        AuthTokenPurpose.PASSWORD_RESET,
      );
      expect(prisma.tutor.update).toHaveBeenCalledWith({
        where: { id: 'tutor-1' },
        data: { password: 'novo-hash' },
      });
    });

    it('propaga o erro de token inválido', async () => {
      authToken.consume.mockRejectedValue(new BadRequestException('inválido'));

      await expect(
        service.resetPassword({ token: 'x', password: 'Nova123!' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.tutor.update).not.toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    it('marca emailVerifiedAt a partir do token', async () => {
      authToken.consume.mockResolvedValue('tutor-1');

      await service.verifyEmail({ token: 'raw-token' });

      expect(authToken.consume).toHaveBeenCalledWith(
        'raw-token',
        AuthTokenPurpose.EMAIL_VERIFICATION,
      );
      expect(prisma.tutor.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'tutor-1' } }),
      );
    });
  });

  describe('resendVerification', () => {
    it('não reenvia se o e-mail já está verificado', async () => {
      prisma.tutor.findUnique.mockResolvedValue({
        ...tutorFixture,
        emailVerifiedAt: new Date(),
      });

      await service.resendVerification('tutor-1');

      expect(authToken.issue).not.toHaveBeenCalled();
    });

    it('reenvia quando ainda não verificado', async () => {
      prisma.tutor.findUnique.mockResolvedValue(tutorFixture);

      await service.resendVerification('tutor-1');

      expect(mail.sendEmailVerification).toHaveBeenCalled();
    });
  });

  describe('googleLogin', () => {
    const googlePayload = {
      sub: 'google-123',
      email: 'alice@example.com',
      email_verified: true,
      name: 'Alice G',
    };

    beforeEach(() => {
      verifyIdToken.mockResolvedValue({ getPayload: () => googlePayload });
    });

    it('cria uma conta verificada quando não existe tutor', async () => {
      prisma.tutor.findUnique.mockResolvedValue(null);
      prisma.tutor.create.mockResolvedValue({
        ...tutorFixture,
        googleId: 'google-123',
        emailVerifiedAt: new Date(),
      });

      const result = await service.googleLogin({ idToken: 'id-token' });

      const [[createArg]] = prisma.tutor.create.mock.calls as Array<
        [{ data: { googleId: string } }]
      >;
      expect(createArg.data.googleId).toBe('google-123');
      expect(result.user.email_verified).toBe(true);
      expect(result.access_token).toBe('jwt-token');
    });

    it('vincula o googleId a uma conta achada por e-mail', async () => {
      prisma.tutor.findUnique
        .mockResolvedValueOnce(null) // por googleId
        .mockResolvedValueOnce({ ...tutorFixture, googleId: null }); // por email
      prisma.tutor.update.mockResolvedValue({
        ...tutorFixture,
        googleId: 'google-123',
        emailVerifiedAt: new Date(),
      });

      await service.googleLogin({ idToken: 'id-token' });

      const [[updateArg]] = prisma.tutor.update.mock.calls as Array<
        [{ data: { googleId: string } }]
      >;
      expect(updateArg.data.googleId).toBe('google-123');
    });

    it('reaproveita a conta já vinculada por googleId', async () => {
      prisma.tutor.findUnique.mockResolvedValueOnce({
        ...tutorFixture,
        googleId: 'google-123',
        emailVerifiedAt: new Date(),
      });

      const result = await service.googleLogin({ idToken: 'id-token' });

      expect(prisma.tutor.create).not.toHaveBeenCalled();
      expect(prisma.tutor.update).not.toHaveBeenCalled();
      expect(result.access_token).toBe('jwt-token');
    });

    it('rejeita ID token inválido', async () => {
      verifyIdToken.mockRejectedValue(new Error('Invalid token signature'));

      await expect(service.googleLogin({ idToken: 'ruim' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('falha claramente quando o login Google não está configurado', async () => {
      config.get.mockReturnValue([]);

      await expect(
        service.googleLogin({ idToken: 'id-token' }),
      ).rejects.toThrow(/não está configurado/);
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
