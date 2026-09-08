import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { VeterinarioService } from '../veterinario.service';

// Mock do bcrypt para o teste não pagar o custo do hash real.
// Sem `virtual: true`: bcrypt existe em disco, e marcá-lo como virtual fazia o
// Jest às vezes resolver o módulo real a partir do cache de transform, o que
// derrubava os testes em execuções alternadas (api#107).
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
  __esModule: true,
  default: {
    hash: jest.fn().mockResolvedValue('hashed-password'),
    compare: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require('bcrypt') as { compare: jest.Mock };

describe('VeterinarioService', () => {
  let service: VeterinarioService;
  let prisma: {
    veterinario: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  const vetFixture = {
    id: 'vet-1',
    nome: 'Dr. Carlos',
    email: 'carlos@vet.com',
    password: 'hashed-password',
    crmv: 'CRMV-CE-12345',
    telefone: '85999999999',
    passwordChangedAt: null as Date | null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    // O mock de bcrypt é de módulo e sobrevive entre os testes; sem limpar, as
    // chamadas de um teste contam no seguinte.
    jest.clearAllMocks();

    prisma = {
      veterinario: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VeterinarioService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<VeterinarioService>(VeterinarioService);
  });

  describe('findById', () => {
    it('should throw NotFoundException when veterinario is missing', async () => {
      prisma.veterinario.findUnique.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    /** O `data` que chegou no Prisma na primeira (e única) gravação. */
    function dadosGravados(): Record<string, unknown> {
      const [[argumento]] = prisma.veterinario.update.mock.calls as [
        [{ data: Record<string, unknown> }],
      ];
      return argumento.data;
    }

    it('should throw ConflictException when updating to duplicated CRMV', async () => {
      const otherVet = { ...vetFixture, id: 'vet-2' };
      // 1st call: findById, 2nd call: assertUniqueFields (crmv check)
      prisma.veterinario.findUnique
        .mockResolvedValueOnce(vetFixture)
        .mockResolvedValueOnce(otherVet);

      await expect(
        service.update('vet-1', { crmv: 'CRMV-CE-12345' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException when veterinario does not exist', async () => {
      prisma.veterinario.findUnique.mockResolvedValue(null);

      await expect(service.update('missing', { nome: 'Test' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('grava a foto de perfil no campo do banco', async () => {
      prisma.veterinario.findUnique.mockResolvedValueOnce(vetFixture);
      prisma.veterinario.update.mockResolvedValue(vetFixture);

      await service.update('vet-1', {
        foto_url: 'https://bucket.s3.us-east-1.amazonaws.com/vets/foto.png',
      });

      expect(dadosGravados()).toEqual({
        photoUrl: 'https://bucket.s3.us-east-1.amazonaws.com/vets/foto.png',
      });
    });

    it('devolve a foto salva em foto_url, não photoUrl', async () => {
      // photoUrl é o nome do campo no Prisma Client (a coluna é que se chama
      // photo_url via @map) — a tela de perfil do vet lê a resposta em
      // snake_case (mesma causa do bug já corrigido em tutor.service.ts).
      const url = 'https://bucket.s3.us-east-1.amazonaws.com/vets/foto.png';
      prisma.veterinario.findUnique.mockResolvedValueOnce(vetFixture);
      prisma.veterinario.update.mockResolvedValue({
        ...vetFixture,
        photoUrl: url,
      });

      const resposta = await service.update('vet-1', { foto_url: url });

      expect(resposta.foto_url).toBe(url);
      expect(resposta).not.toHaveProperty('photoUrl');
    });

    it('não toca na foto quando o campo não vem no pedido', async () => {
      // Editar só o nome não pode apagar a foto já cadastrada.
      prisma.veterinario.findUnique.mockResolvedValueOnce(vetFixture);
      prisma.veterinario.update.mockResolvedValue(vetFixture);

      await service.update('vet-1', { nome: 'Dra. Camila Ferreira' });

      expect(dadosGravados()).not.toHaveProperty('photoUrl');
    });

    it('derruba a verificação quando o CRMV muda', async () => {
      prisma.veterinario.findUnique
        .mockResolvedValueOnce(vetFixture)
        .mockResolvedValueOnce(null);
      prisma.veterinario.update.mockResolvedValue(vetFixture);

      await service.update('vet-1', { crmv: 'CRMV-SP 54321' });

      // Sem zerar o carimbo, um registro que ninguém conferiu herdaria o
      // acesso clínico conquistado pelo registro anterior (api#113).
      expect(dadosGravados()).toMatchObject({
        crmv: 'CRMV-SP 54321',
        crmvVerifiedAt: null,
        crmvSituacao: null,
      });
    });

    it('mantém a verificação quando o CRMV enviado é o mesmo', async () => {
      prisma.veterinario.findUnique
        .mockResolvedValueOnce(vetFixture)
        .mockResolvedValueOnce(vetFixture);
      prisma.veterinario.update.mockResolvedValue(vetFixture);

      // Salvar o formulário sem mexer no CRMV não pode custar uma nova
      // consulta paga ao conselho.
      await service.update('vet-1', {
        nome: 'Dr. Carlos Silva',
        crmv: vetFixture.crmv,
      });

      expect(dadosGravados()).not.toHaveProperty('crmvVerifiedAt');
    });
  });

  /**
   * O token do veterinário vale 7 dias e a web o guarda em `localStorage`.
   * Sem a senha atual, um token vazado trocava a senha e a conta que lê e
   * escreve dado clínico passava em definitivo para quem o pegou.
   */
  describe('troca de senha', () => {
    /** O `data` que chegou no Prisma na primeira (e única) gravação. */
    function dadosGravados(): Record<string, unknown> {
      const [[argumento]] = prisma.veterinario.update.mock.calls as [
        [{ data: Record<string, unknown> }],
      ];
      return argumento.data;
    }

    it('recusa a troca quando a senha atual não confere', async () => {
      prisma.veterinario.findUnique.mockResolvedValueOnce(vetFixture);
      bcrypt.compare.mockResolvedValue(false);

      await expect(
        service.update('vet-1', {
          password: 'NovaSenha123!',
          senha_atual: 'chute',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.veterinario.update).not.toHaveBeenCalled();
    });

    it('recusa a troca sem senha atual nenhuma', async () => {
      prisma.veterinario.findUnique.mockResolvedValueOnce(vetFixture);

      await expect(
        service.update('vet-1', { password: 'NovaSenha123!' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.veterinario.update).not.toHaveBeenCalled();
    });

    it('confere a senha atual contra o hash guardado, não contra o corpo', async () => {
      prisma.veterinario.findUnique.mockResolvedValueOnce(vetFixture);
      prisma.veterinario.update.mockResolvedValue(vetFixture);
      bcrypt.compare.mockResolvedValue(true);

      await service.update('vet-1', {
        password: 'NovaSenha123!',
        senha_atual: 'SenhaAntiga1!',
      });

      expect(bcrypt.compare).toHaveBeenCalledWith(
        'SenhaAntiga1!',
        vetFixture.password,
      );
    });

    it('troca a senha e carimba a data, derrubando as sessões abertas', async () => {
      prisma.veterinario.findUnique.mockResolvedValueOnce(vetFixture);
      prisma.veterinario.update.mockResolvedValue(vetFixture);
      bcrypt.compare.mockResolvedValue(true);

      await service.update('vet-1', {
        password: 'NovaSenha123!',
        senha_atual: 'SenhaAntiga1!',
      });

      const data = dadosGravados();
      expect(data.password).toBe('hashed-password');
      expect(data.passwordChangedAt).toBeInstanceOf(Date);
    });

    it('não carimba nem pede senha atual quando a senha não muda', async () => {
      prisma.veterinario.findUnique.mockResolvedValueOnce(vetFixture);
      prisma.veterinario.update.mockResolvedValue(vetFixture);

      // Editar o telefone não pode expulsar o veterinário da própria sessão.
      await service.update('vet-1', { telefone: '85988887777' });

      expect(dadosGravados()).not.toHaveProperty('passwordChangedAt');
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });
  });

  describe('e-mail', () => {
    it('grava o e-mail na forma canônica', async () => {
      prisma.veterinario.findUnique
        .mockResolvedValueOnce(vetFixture)
        .mockResolvedValueOnce(null);
      prisma.veterinario.update.mockResolvedValue(vetFixture);

      await service.update('vet-1', { email: ' Carlos@Vet.COM ' });

      const [[argumento]] = prisma.veterinario.update.mock.calls as [
        [{ data: Record<string, unknown> }],
      ];
      expect(argumento.data.email).toBe('carlos@vet.com');
    });

    it('checa a unicidade já com o e-mail normalizado', async () => {
      // Buscando pela caixa recebida, a colisão com uma conta gravada em
      // minúsculas passava batida e estourava na unique do Prisma (500).
      prisma.veterinario.findUnique
        .mockResolvedValueOnce(vetFixture)
        .mockResolvedValueOnce({ ...vetFixture, id: 'vet-2' });

      await expect(
        service.update('vet-1', { email: 'Outro@Vet.com' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.veterinario.findUnique).toHaveBeenLastCalledWith({
        where: { email: 'outro@vet.com' },
      });
    });
  });

  describe('remove', () => {
    it('should throw NotFoundException when veterinario does not exist', async () => {
      prisma.veterinario.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
