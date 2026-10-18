import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { CrmvVerificationService } from '../crmv/crmv-verification.service';

const makeConfig = (ttlDays = 180): ConfigService =>
  ({ get: jest.fn().mockReturnValue(ttlDays) }) as unknown as ConfigService;

describe('CrmvVerificationService', () => {
  let prisma: {
    veterinario: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };
  let validator: { validate: jest.Mock };
  let service: CrmvVerificationService;

  beforeEach(() => {
    prisma = {
      veterinario: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    };
    validator = { validate: jest.fn() };
    service = new CrmvVerificationService(
      prisma as unknown as PrismaService,
      makeConfig(),
      validator,
    );
  });

  describe('parseCrmv', () => {
    it.each([
      ['CRMV-SP 12345', '12345', 'SP'],
      ['CRMV SP 12345', '12345', 'SP'],
      ['SP 12345', '12345', 'SP'],
      ['sp-12345', '12345', 'SP'],
      ['12345/SP', '12345', 'SP'],
    ])('entende %s', (entrada, numero, uf) => {
      expect(service.parseCrmv(entrada)).toEqual({ numero, uf });
    });

    it('recusa formato irreconhecível', () => {
      expect(() => service.parseCrmv('abc')).toThrow(/formato/i);
    });
  });

  describe('verify', () => {
    it('marca como verificado e guarda a situação quando o registro é regular', async () => {
      prisma.veterinario.findUnique.mockResolvedValue({
        crmv: 'CRMV-SP 12345',
        crmvVerifiedAt: null,
        crmvSituacao: null,
      });
      validator.validate.mockResolvedValue({ valid: true, situacao: 'Ativo' });

      const resultado = await service.verify('vet-1');

      expect(validator.validate).toHaveBeenCalledWith('12345', 'SP');
      expect(resultado.verified).toBe(true);
      const [[update]] = prisma.veterinario.update.mock.calls as Array<
        [{ data: { crmvVerifiedAt: Date | null; crmvSituacao?: string } }]
      >;
      expect(update.data.crmvVerifiedAt).toBeInstanceOf(Date);
      expect(update.data.crmvSituacao).toBe('Ativo');
    });

    it('limpa a verificação quando o registro não é regular', async () => {
      prisma.veterinario.findUnique.mockResolvedValue({
        crmv: 'CRMV-SP 12345',
        crmvVerifiedAt: new Date(),
        crmvSituacao: 'Ativo',
      });
      validator.validate.mockResolvedValue({
        valid: false,
        situacao: 'Suspenso',
      });

      const resultado = await service.verify('vet-1', true);

      expect(resultado.verified).toBe(false);
      const [[update]] = prisma.veterinario.update.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      expect(update.data).toMatchObject({
        crmvVerifiedAt: null,
        crmvSituacao: 'Suspenso',
      });
    });

    it('reaproveita verificação dentro do prazo — a consulta é paga', async () => {
      prisma.veterinario.findUnique.mockResolvedValue({
        crmv: 'CRMV-SP 12345',
        crmvVerifiedAt: new Date(),
        crmvSituacao: 'Ativo',
      });

      const resultado = await service.verify('vet-1');

      expect(resultado.verified).toBe(true);
      expect(validator.validate).not.toHaveBeenCalled();
      expect(prisma.veterinario.update).not.toHaveBeenCalled();
    });

    it('consulta de novo quando a verificação venceu', async () => {
      const antiga = new Date(Date.now() - 200 * 86_400_000); // 200 dias, TTL 180
      prisma.veterinario.findUnique.mockResolvedValue({
        crmv: 'CRMV-SP 12345',
        crmvVerifiedAt: antiga,
        crmvSituacao: 'Ativo',
      });
      validator.validate.mockResolvedValue({ valid: true, situacao: 'Ativo' });

      await service.verify('vet-1');

      expect(validator.validate).toHaveBeenCalled();
    });

    it('force ignora o cache', async () => {
      prisma.veterinario.findUnique.mockResolvedValue({
        crmv: 'CRMV-SP 12345',
        crmvVerifiedAt: new Date(),
        crmvSituacao: 'Ativo',
      });
      validator.validate.mockResolvedValue({ valid: true, situacao: 'Ativo' });

      await service.verify('vet-1', true);

      expect(validator.validate).toHaveBeenCalled();
    });

    it('falha quando o veterinário não existe', async () => {
      prisma.veterinario.findUnique.mockResolvedValue(null);

      await expect(service.verify('nao-existe')).rejects.toThrow(
        /não encontrado/i,
      );
    });
  });

  describe('getStatus', () => {
    it('considera não verificado quando a verificação venceu', async () => {
      prisma.veterinario.findUnique.mockResolvedValue({
        crmvVerifiedAt: new Date(Date.now() - 200 * 86_400_000),
        crmvSituacao: 'Ativo',
      });

      await expect(service.getStatus('vet-1')).resolves.toMatchObject({
        verified: false,
      });
    });

    it('considera verificado dentro do prazo', async () => {
      prisma.veterinario.findUnique.mockResolvedValue({
        crmvVerifiedAt: new Date(),
        crmvSituacao: 'Ativo',
      });

      await expect(service.getStatus('vet-1')).resolves.toMatchObject({
        verified: true,
        situacao: 'Ativo',
      });
    });
  });

  describe('lookup (cadastro com CRMV primeiro)', () => {
    it('devolve o CRMV canônico, a situação e o nome do registro oficial', async () => {
      validator.validate.mockResolvedValue({
        valid: true,
        situacao: 'Ativo',
        nome: 'CARLOS DA SILVA',
      });

      await expect(service.lookup('12345/sp')).resolves.toEqual({
        crmv: 'CRMV-SP 12345',
        uf: 'SP',
        numero: '12345',
        valido: true,
        nome: 'CARLOS DA SILVA',
        situacao: 'Ativo',
      });
    });

    it('não expõe o nome de registro irregular', async () => {
      validator.validate.mockResolvedValue({
        valid: false,
        situacao: 'Cancelado',
        nome: 'FULANO',
      });

      const consulta = await service.lookup('CRMV-SP 12345');

      expect(consulta.valido).toBe(false);
      expect(consulta.nome).toBeUndefined();
    });

    it('CRMV já cadastrado responde 409 sem pagar a consulta', async () => {
      prisma.veterinario.findFirst.mockResolvedValue({ id: 'vet-1' });

      await expect(service.lookup('SP 12345')).rejects.toThrow(
        ConflictException,
      );
      expect(validator.validate).not.toHaveBeenCalled();
    });

    it('o cadastro logo depois reaproveita a consulta — uma cobrança só', async () => {
      validator.validate.mockResolvedValue({
        valid: true,
        situacao: 'Ativo',
        nome: 'CARLOS DA SILVA',
      });
      await service.lookup('CRMV-SP 12345');
      prisma.veterinario.findUnique.mockResolvedValue({
        crmv: 'CRMV-SP 12345',
        crmvVerifiedAt: null,
        crmvSituacao: null,
      });

      const status = await service.verify('vet-1');

      expect(status.verified).toBe(true);
      expect(validator.validate).toHaveBeenCalledTimes(1);
    });
  });
});
