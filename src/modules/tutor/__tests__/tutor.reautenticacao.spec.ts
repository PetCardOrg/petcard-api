/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthService } from '../../auth/auth.service';
import { UploadService } from '../../upload/upload.service';
import { TutorService } from '../tutor.service';

/**
 * Trocar o e-mail e excluir a conta pedem prova de que quem pede é o dono,
 * não quem pegou o token (AUD API-04). O token vale 7 dias; sem a prova, um
 * token vazado trocava o e-mail, pedia "esqueci a senha" e ficava com a conta.
 *
 * Conta com senha prova com `senha_atual`; conta só-Google, com um ID token
 * do Google obtido na hora, do mesmo `sub` (D2).
 */
describe('TutorService: reautenticação (AUD API-04)', () => {
  const SENHA = 'Senha@123';
  let service: TutorService;
  let hash: string;
  let prisma: {
    tutor: { findUnique: jest.Mock; update: jest.Mock; delete: jest.Mock };
    pet: { findMany: jest.Mock };
  };
  let authService: { verifyGoogleIdToken: jest.Mock };

  const agoraEmSegundos = () => Math.floor(Date.now() / 1000);

  const comSenha = () => ({
    id: 'tutor-1',
    name: 'Maria',
    email: 'maria@example.com',
    password: hash,
    phone: null,
    profileImageUrl: null,
    googleId: null,
    emailVerifiedAt: new Date('2026-01-01'),
    passwordChangedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const soGoogle = () => ({
    ...comSenha(),
    password: null,
    googleId: 'google-sub-1',
  });

  beforeAll(async () => {
    hash = await bcrypt.hash(SENHA, 4);
  });

  beforeEach(async () => {
    prisma = {
      tutor: {
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      pet: { findMany: jest.fn().mockResolvedValue([]) },
    };
    authService = { verifyGoogleIdToken: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TutorService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: authService },
        {
          provide: UploadService,
          useValue: { assertBucketUrl: jest.fn(), discardFile: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(TutorService);
  });

  /** O tutor atual na 1ª leitura; ninguém com o e-mail novo na 2ª. */
  function lerTutor(tutor: object): void {
    prisma.tutor.findUnique
      .mockResolvedValueOnce(tutor)
      .mockResolvedValueOnce(null);
    prisma.tutor.update.mockImplementation(({ data }: { data: object }) => ({
      ...tutor,
      ...data,
    }));
  }

  describe('troca de e-mail', () => {
    it('aceita a senha atual correta', async () => {
      lerTutor(comSenha());

      await service.updateById('tutor-1', {
        email: 'novo@example.com',
        senha_atual: SENHA,
      });

      expect(prisma.tutor.update).toHaveBeenCalled();
    });

    it('recusa senha errada (401) sem gravar nada', async () => {
      lerTutor(comSenha());

      await expect(
        service.updateById('tutor-1', {
          email: 'novo@example.com',
          senha_atual: 'Errada@123',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.tutor.update).not.toHaveBeenCalled();
    });

    it('recusa quando não vem prova nenhuma (401)', async () => {
      lerTutor(comSenha());

      // O DTO já barra; o serviço não pode depender só dele.
      await expect(
        service.updateById('tutor-1', { email: 'novo@example.com' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.tutor.update).not.toHaveBeenCalled();
    });

    it('confere a prova antes de dizer se o e-mail novo está ocupado', async () => {
      prisma.tutor.findUnique
        .mockResolvedValueOnce(comSenha())
        .mockResolvedValueOnce({ ...comSenha(), id: 'tutor-2' });

      // Senão o token roubado vira um teste de quais e-mails têm conta.
      await expect(
        service.updateById('tutor-1', {
          email: 'ocupado@example.com',
          senha_atual: 'Errada@123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('encerra as sessões abertas ao trocar o e-mail', async () => {
      lerTutor(comSenha());

      await service.updateById('tutor-1', {
        email: 'novo@example.com',
        senha_atual: SENHA,
      });

      expect(prisma.tutor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'novo@example.com',
            emailVerifiedAt: null,
            passwordChangedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('não pede prova quando o e-mail enviado é o mesmo', async () => {
      prisma.tutor.findUnique.mockResolvedValue(comSenha());
      prisma.tutor.update.mockResolvedValue(comSenha());

      // Salvar o formulário sem mexer no e-mail não é troca de identidade.
      await service.updateById('tutor-1', {
        name: 'Maria Souza',
        email: 'maria@example.com',
        senha_atual: 'Errada@123',
      });

      const [[chamada]] = prisma.tutor.update.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      expect(chamada.data).not.toHaveProperty('passwordChangedAt');
    });

    describe('conta só-Google', () => {
      it('aceita ID token recente do mesmo sub', async () => {
        lerTutor(soGoogle());
        authService.verifyGoogleIdToken.mockResolvedValue({
          sub: 'google-sub-1',
          iat: agoraEmSegundos() - 30,
        });

        await service.updateById('tutor-1', {
          email: 'novo@example.com',
          google_id_token: 'id-token',
        });

        expect(authService.verifyGoogleIdToken).toHaveBeenCalledWith(
          'id-token',
        );
        expect(prisma.tutor.update).toHaveBeenCalled();
      });

      it('recusa ID token de outra conta Google (401)', async () => {
        lerTutor(soGoogle());
        authService.verifyGoogleIdToken.mockResolvedValue({
          sub: 'google-sub-de-outra-pessoa',
          iat: agoraEmSegundos(),
        });

        await expect(
          service.updateById('tutor-1', {
            email: 'novo@example.com',
            google_id_token: 'id-token',
          }),
        ).rejects.toThrow(UnauthorizedException);
        expect(prisma.tutor.update).not.toHaveBeenCalled();
      });

      it('recusa ID token antigo (401)', async () => {
        lerTutor(soGoogle());
        // O ID token do Google vale 1 hora; a prova precisa ser da hora.
        authService.verifyGoogleIdToken.mockResolvedValue({
          sub: 'google-sub-1',
          iat: agoraEmSegundos() - 30 * 60,
        });

        await expect(
          service.updateById('tutor-1', {
            email: 'novo@example.com',
            google_id_token: 'id-token',
          }),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('recusa ID token inválido (401)', async () => {
        lerTutor(soGoogle());
        authService.verifyGoogleIdToken.mockRejectedValue(
          new UnauthorizedException('Não foi possível validar a conta Google.'),
        );

        await expect(
          service.updateById('tutor-1', {
            email: 'novo@example.com',
            google_id_token: 'id-token',
          }),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('recusa senha_atual em conta sem senha (401)', async () => {
        lerTutor(soGoogle());

        await expect(
          service.updateById('tutor-1', {
            email: 'novo@example.com',
            senha_atual: SENHA,
          }),
        ).rejects.toThrow(UnauthorizedException);
      });
    });

    it('recusa ID token do Google em conta sem Google vinculado (401)', async () => {
      lerTutor(comSenha());
      authService.verifyGoogleIdToken.mockResolvedValue({
        sub: 'google-sub-1',
        iat: agoraEmSegundos(),
      });

      await expect(
        service.updateById('tutor-1', {
          email: 'novo@example.com',
          google_id_token: 'id-token',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('exclusão da conta', () => {
    it('aceita a senha atual correta', async () => {
      prisma.tutor.findUnique.mockResolvedValue(comSenha());

      await service.removeById('tutor-1', { senha_atual: SENHA });

      expect(prisma.tutor.delete).toHaveBeenCalledWith({
        where: { id: 'tutor-1' },
      });
    });

    it('recusa senha errada (401) sem apagar', async () => {
      prisma.tutor.findUnique.mockResolvedValue(comSenha());

      await expect(
        service.removeById('tutor-1', { senha_atual: 'Errada@123' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.tutor.delete).not.toHaveBeenCalled();
    });

    it('aceita ID token recente na conta só-Google', async () => {
      prisma.tutor.findUnique.mockResolvedValue(soGoogle());
      authService.verifyGoogleIdToken.mockResolvedValue({
        sub: 'google-sub-1',
        iat: agoraEmSegundos(),
      });

      await service.removeById('tutor-1', { google_id_token: 'id-token' });

      expect(prisma.tutor.delete).toHaveBeenCalled();
    });

    it('recusa ID token de outra conta Google (401) sem apagar', async () => {
      prisma.tutor.findUnique.mockResolvedValue(soGoogle());
      authService.verifyGoogleIdToken.mockResolvedValue({
        sub: 'google-sub-de-outra-pessoa',
        iat: agoraEmSegundos(),
      });

      await expect(
        service.removeById('tutor-1', { google_id_token: 'id-token' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.tutor.delete).not.toHaveBeenCalled();
    });
  });
});
