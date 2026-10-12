/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { CreateAnexoDto } from '@petcardorg/shared';
import { AcaoClinicaTipo, EntidadeClinica, Role } from '@prisma/client';
import {
  acaoClinicaProvider,
  comTransacao,
} from '../../../../test/utils/acao-clinica';
import { PrismaService } from '../../../prisma/prisma.service';
import { PetService } from '../../pet/pet.service';
import { UploadService } from '../../upload/upload.service';
import { ANEXO_MAX_POR_REGISTRO } from '../anexo-arquivo';
import { AnexoService } from '../anexo.service';

const PDF = Buffer.from('%PDF-1.7 conteudo');

const arquivo = (over: Partial<Express.Multer.File> = {}) =>
  ({
    mimetype: 'application/pdf',
    originalname: 'carteirinha do rex.pdf',
    buffer: PDF,
    ...over,
  }) as Express.Multer.File;

const dto: CreateAnexoDto = { entidade: 'VACINA', entidade_id: 'vac-1' };

const tutor = { id: 'tutor-1', isVet: false };
const vet = { id: 'vet-1', isVet: true };

const anexoBase = {
  id: 'anx-1',
  petId: 'pet-1',
  vaccineRecordId: 'vac-1',
  dewormingRecordId: null,
  medicationRecordId: null,
  s3Key: 'anexos/pet-1/abc.pdf',
  nomeArquivo: 'carteirinha do rex.pdf',
  mimeType: 'application/pdf',
  tamanhoBytes: PDF.length,
  sha256: 'hash',
  enviadoPorTipo: Role.TUTOR,
  enviadoPorId: 'tutor-1',
  enviadoPorNome: 'Ana',
  verificadoEm: null,
  verificadoPorId: null,
  verificadoPorNome: null,
  verificadoPorCrmv: null,
  createdAt: new Date('2026-09-01'),
  deletedAt: null,
};

describe('AnexoService', () => {
  let service: AnexoService;
  let registrarAcao: jest.Mock;
  let prisma: {
    anexoClinico: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    vaccineRecord: { findFirst: jest.Mock };
    dewormingRecord: { findFirst: jest.Mock };
    medicationRecord: { findFirst: jest.Mock };
    veterinario: { findUnique: jest.Mock };
    tutor: { findUnique: jest.Mock };
  };
  let petService: { assertAccess: jest.Mock };
  let upload: {
    putPrivate: jest.Mock;
    removePrivate: jest.Mock;
    presignDownload: jest.Mock;
  };

  beforeEach(async () => {
    const trilha = acaoClinicaProvider();
    registrarAcao = trilha.registrar;
    prisma = {
      anexoClinico: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            ...anexoBase,
            ...data,
            id: 'anx-novo',
            verificadoEm: data.verificadoEm ?? null,
          }),
        ),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      vaccineRecord: {
        findFirst: jest.fn().mockResolvedValue({ id: 'vac-1' }),
      },
      dewormingRecord: { findFirst: jest.fn() },
      medicationRecord: { findFirst: jest.fn() },
      veterinario: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ nome: 'Dra. Camila', crmv: 'CRMV-SP 123' }),
      },
      tutor: { findUnique: jest.fn().mockResolvedValue({ name: 'Ana' }) },
    };
    petService = { assertAccess: jest.fn().mockResolvedValue({ id: 'pet-1' }) };
    upload = {
      putPrivate: jest.fn().mockResolvedValue(undefined),
      removePrivate: jest.fn().mockResolvedValue(undefined),
      presignDownload: jest.fn().mockResolvedValue('https://s3/assinado'),
    };
    comTransacao(prisma);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        trilha.provider,
        AnexoService,
        { provide: PrismaService, useValue: prisma },
        { provide: PetService, useValue: petService },
        { provide: UploadService, useValue: upload },
      ],
    }).compile();
    service = module.get(AnexoService);
  });

  describe('criar', () => {
    it('guarda o arquivo em chave privada do servidor, sem usar o nome enviado', async () => {
      await service.criar('pet-1', tutor, dto, arquivo());

      const [chave, buffer, mime] = upload.putPrivate.mock.calls[0] as [
        string,
        Buffer,
        string,
      ];
      expect(chave).toMatch(/^anexos\/pet-1\/[0-9a-f-]{36}\.pdf$/);
      expect(chave).not.toContain('carteirinha');
      expect(buffer).toBe(PDF);
      expect(mime).toBe('application/pdf');
    });

    it('comprovante do tutor nasce não verificado', async () => {
      const res = await service.criar('pet-1', tutor, dto, arquivo());

      expect(res.verificado).toBe(false);
      expect(res.enviado_por_tipo).toBe(Role.TUTOR);
      expect(res.enviado_por_nome).toBe('Ana');
      const { data } = prisma.anexoClinico.create.mock.calls[0][0];
      expect(data.verificadoEm).toBeUndefined();
    });

    it('comprovante do veterinário já nasce verificado, com nome e CRMV gravados', async () => {
      const res = await service.criar('pet-1', vet, dto, arquivo());

      expect(res.verificado).toBe(true);
      const { data } = prisma.anexoClinico.create.mock.calls[0][0];
      expect(data).toMatchObject({
        verificadoPorId: 'vet-1',
        verificadoPorNome: 'Dra. Camila',
        verificadoPorCrmv: 'CRMV-SP 123',
        enviadoPorTipo: Role.VET,
      });
    });

    it('registra a ação na trilha clínica, sobre o registro comprovado', async () => {
      await service.criar('pet-1', tutor, dto, arquivo());

      expect(registrarAcao).toHaveBeenCalledWith(
        expect.objectContaining({
          petId: 'pet-1',
          tipo: AcaoClinicaTipo.ANEXO_ADICIONADO,
          entidade: EntidadeClinica.VACINA,
          entidadeId: 'vac-1',
          autorId: 'tutor-1',
          autorTipo: Role.TUTOR,
        }),
        expect.anything(),
      );
    });

    it('confere o acesso ao pet antes de qualquer outra coisa', async () => {
      petService.assertAccess.mockRejectedValue(new ForbiddenException());

      await expect(
        service.criar('pet-1', vet, dto, arquivo()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(upload.putPrivate).not.toHaveBeenCalled();
    });

    it('recusa arquivo inválido sem tocar no bucket', async () => {
      await expect(
        service.criar(
          'pet-1',
          tutor,
          dto,
          arquivo({ buffer: Buffer.from('<html>') }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(upload.putPrivate).not.toHaveBeenCalled();
    });

    it('não anexa a registro de outro pet nem a registro excluído', async () => {
      prisma.vaccineRecord.findFirst.mockResolvedValue(null);

      await expect(
        service.criar('pet-1', tutor, dto, arquivo()),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.vaccineRecord.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'vac-1', petId: 'pet-1', deletedAt: null },
        }),
      );
      expect(upload.putPrivate).not.toHaveBeenCalled();
    });

    it('aplica o limite de comprovantes por registro', async () => {
      prisma.anexoClinico.count.mockResolvedValue(ANEXO_MAX_POR_REGISTRO);

      await expect(
        service.criar('pet-1', tutor, dto, arquivo()),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(upload.putPrivate).not.toHaveBeenCalled();
    });

    it('resolve o registro pela entidade informada (vermífugo, medicação)', async () => {
      prisma.dewormingRecord.findFirst.mockResolvedValue({ id: 'ver-1' });
      await service.criar(
        'pet-1',
        tutor,
        { entidade: 'VERMIFUGO', entidade_id: 'ver-1' },
        arquivo(),
      );
      expect(prisma.anexoClinico.create.mock.calls[0][0].data).toMatchObject({
        dewormingRecordId: 'ver-1',
      });

      prisma.medicationRecord.findFirst.mockResolvedValue({ id: 'med-1' });
      await service.criar(
        'pet-1',
        tutor,
        { entidade: 'MEDICACAO', entidade_id: 'med-1' },
        arquivo(),
      );
      expect(prisma.anexoClinico.create.mock.calls[1][0].data).toMatchObject({
        medicationRecordId: 'med-1',
      });
    });

    it('desfaz o upload quando a gravação no banco falha', async () => {
      prisma.anexoClinico.create.mockRejectedValue(new Error('db fora'));

      await expect(
        service.criar('pet-1', tutor, dto, arquivo()),
      ).rejects.toThrow('db fora');
      const chave = upload.putPrivate.mock.calls[0][0] as string;
      expect(upload.removePrivate).toHaveBeenCalledWith(chave);
    });
  });

  describe('linkDoArquivo', () => {
    it('gera link temporário depois de conferir o acesso ao pet', async () => {
      prisma.anexoClinico.findFirst.mockResolvedValue(anexoBase);

      const res = await service.linkDoArquivo('anx-1', tutor);

      expect(petService.assertAccess).toHaveBeenCalledWith(
        'pet-1',
        'tutor-1',
        false,
      );
      expect(upload.presignDownload).toHaveBeenCalledWith(
        'anexos/pet-1/abc.pdf',
        expect.objectContaining({
          filename: 'carteirinha do rex.pdf',
          contentType: 'application/pdf',
          expiresInSeconds: 300,
        }),
      );
      expect(res.url).toBe('https://s3/assinado');
      expect(res.expira_em.getTime()).toBeGreaterThan(Date.now());
    });

    it('não gera link quando o usuário não tem acesso ao pet', async () => {
      prisma.anexoClinico.findFirst.mockResolvedValue(anexoBase);
      petService.assertAccess.mockRejectedValue(new ForbiddenException());

      await expect(service.linkDoArquivo('anx-1', vet)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(upload.presignDownload).not.toHaveBeenCalled();
    });

    it('não serve anexo removido nem inexistente', async () => {
      prisma.anexoClinico.findFirst.mockResolvedValue(null);

      await expect(service.linkDoArquivo('x', tutor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.anexoClinico.findFirst).toHaveBeenCalledWith({
        where: { id: 'x', deletedAt: null },
      });
    });
  });

  describe('verificar', () => {
    it('grava o atestado com nome e CRMV do veterinário e registra a ação', async () => {
      prisma.anexoClinico.findFirst.mockResolvedValue(anexoBase);
      prisma.anexoClinico.updateMany.mockResolvedValue({ count: 1 });
      prisma.anexoClinico.findUniqueOrThrow.mockResolvedValue({
        ...anexoBase,
        verificadoEm: new Date(),
        verificadoPorNome: 'Dra. Camila',
        verificadoPorCrmv: 'CRMV-SP 123',
      });

      const res = await service.verificar('anx-1', 'vet-1');

      expect(petService.assertAccess).toHaveBeenCalledWith(
        'pet-1',
        'vet-1',
        true,
      );
      expect(prisma.anexoClinico.updateMany).toHaveBeenCalledWith({
        where: { id: 'anx-1', verificadoEm: null, deletedAt: null },
        data: expect.objectContaining({
          verificadoPorId: 'vet-1',
          verificadoPorNome: 'Dra. Camila',
          verificadoPorCrmv: 'CRMV-SP 123',
        }),
      });
      expect(res.verificado).toBe(true);
      expect(res.verificado_por_crmv).toBe('CRMV-SP 123');
      expect(registrarAcao).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: AcaoClinicaTipo.ANEXO_VERIFICADO }),
        expect.anything(),
      );
    });

    it('não sobrescreve o atestado de quem verificou primeiro', async () => {
      prisma.anexoClinico.findFirst.mockResolvedValue({
        ...anexoBase,
        verificadoEm: new Date(),
        verificadoPorNome: 'Dr. Outro',
        verificadoPorCrmv: 'CRMV-RJ 9',
      });

      const res = await service.verificar('anx-1', 'vet-1');

      expect(res.verificado_por_nome).toBe('Dr. Outro');
      expect(prisma.anexoClinico.updateMany).not.toHaveBeenCalled();
      expect(registrarAcao).not.toHaveBeenCalled();
    });

    it('perde a corrida sem duplicar a trilha nem trocar o atestado', async () => {
      prisma.anexoClinico.findFirst.mockResolvedValue(anexoBase);
      prisma.anexoClinico.updateMany.mockResolvedValue({ count: 0 });
      prisma.anexoClinico.findUniqueOrThrow.mockResolvedValue({
        ...anexoBase,
        verificadoEm: new Date(),
        verificadoPorNome: 'Dr. Outro',
        verificadoPorCrmv: 'CRMV-RJ 9',
      });

      const res = await service.verificar('anx-1', 'vet-1');

      expect(res.verificado_por_nome).toBe('Dr. Outro');
      expect(registrarAcao).not.toHaveBeenCalled();
    });

    it('exige o vínculo do veterinário com o pet', async () => {
      prisma.anexoClinico.findFirst.mockResolvedValue(anexoBase);
      petService.assertAccess.mockRejectedValue(new ForbiddenException());

      await expect(service.verificar('anx-1', 'vet-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.anexoClinico.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('remover', () => {
    it('é exclusão lógica: marca deletedAt, registra a ação e preserva o arquivo', async () => {
      prisma.anexoClinico.findFirst.mockResolvedValue(anexoBase);

      await service.remover('anx-1', tutor);

      expect(prisma.anexoClinico.update).toHaveBeenCalledWith({
        where: { id: 'anx-1' },
        data: { deletedAt: expect.any(Date) },
      });
      expect(registrarAcao).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: AcaoClinicaTipo.ANEXO_REMOVIDO,
          entidadeId: 'vac-1',
        }),
        expect.anything(),
      );
      expect(upload.removePrivate).not.toHaveBeenCalled();
    });

    it('o tutor remove até o comprovante que um veterinário verificou', async () => {
      prisma.anexoClinico.findFirst.mockResolvedValue({
        ...anexoBase,
        enviadoPorTipo: Role.VET,
        enviadoPorId: 'vet-9',
        verificadoEm: new Date(),
      });

      await expect(service.remover('anx-1', tutor)).resolves.toBeUndefined();
    });

    it('o veterinário remove só o que ele mesmo enviou', async () => {
      prisma.anexoClinico.findFirst.mockResolvedValue(anexoBase);
      await expect(service.remover('anx-1', vet)).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      prisma.anexoClinico.findFirst.mockResolvedValue({
        ...anexoBase,
        enviadoPorTipo: Role.VET,
        enviadoPorId: 'vet-9',
      });
      await expect(service.remover('anx-1', vet)).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      prisma.anexoClinico.findFirst.mockResolvedValue({
        ...anexoBase,
        enviadoPorTipo: Role.VET,
        enviadoPorId: 'vet-1',
      });
      await expect(service.remover('anx-1', vet)).resolves.toBeUndefined();
    });
  });
});
