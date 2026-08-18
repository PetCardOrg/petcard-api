import { Test, TestingModule } from '@nestjs/testing';
import { AcaoClinicaTipo, EntidadeClinica, Role } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AcaoClinicaService } from '../acao-clinica.service';

describe('AcaoClinicaService', () => {
  let service: AcaoClinicaService;
  let prisma: {
    acaoClinica: { create: jest.Mock };
    veterinario: { findUnique: jest.Mock };
    tutor: { findUnique: jest.Mock };
  };

  const base = {
    petId: 'pet-1',
    tipo: AcaoClinicaTipo.EXCLUSAO,
    entidade: EntidadeClinica.MEDICACAO,
    entidadeId: 'med-1',
  };

  beforeEach(async () => {
    prisma = {
      acaoClinica: { create: jest.fn() },
      veterinario: { findUnique: jest.fn() },
      tutor: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AcaoClinicaService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AcaoClinicaService>(AcaoClinicaService);
  });

  function dadosGravados() {
    const [[chamada]] = prisma.acaoClinica.create.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    return chamada.data;
  }

  it('grava nome e CRMV do veterinário na própria trilha', async () => {
    prisma.veterinario.findUnique.mockResolvedValue({
      nome: 'Dra. Camila',
      crmv: 'CRMV-SP 12345',
    });

    await service.registrar({ ...base, autorId: 'vet-1', autorTipo: Role.VET });

    // Copiado, não referenciado: a evidência precisa sobreviver à exclusão
    // da conta do veterinário.
    expect(dadosGravados()).toMatchObject({
      autorNome: 'Dra. Camila',
      autorCrmv: 'CRMV-SP 12345',
      autorTipo: Role.VET,
      entidadeId: 'med-1',
    });
  });

  it('grava o nome do tutor, sem CRMV', async () => {
    prisma.tutor.findUnique.mockResolvedValue({ name: 'Ana Silva' });

    await service.registrar({
      ...base,
      autorId: 'tutor-1',
      autorTipo: Role.TUTOR,
    });

    expect(dadosGravados()).toMatchObject({
      autorNome: 'Ana Silva',
      autorCrmv: null,
      autorTipo: Role.TUTOR,
    });
  });

  it('registra mesmo se o autor não for encontrado', async () => {
    prisma.veterinario.findUnique.mockResolvedValue(null);

    await service.registrar({
      ...base,
      autorId: 'vet-sumiu',
      autorTipo: Role.VET,
    });

    // Perder o nome não pode impedir a ação; o id ainda identifica quem agiu.
    expect(prisma.acaoClinica.create).toHaveBeenCalled();
    expect(dadosGravados()).toMatchObject({ autorNome: 'vet-sumiu' });
  });

  it('usa a transação recebida em vez do cliente próprio', async () => {
    const tx = {
      acaoClinica: { create: jest.fn() },
      veterinario: { findUnique: jest.fn().mockResolvedValue(null) },
      tutor: { findUnique: jest.fn() },
    };

    await service.registrar(
      { ...base, autorId: 'vet-1', autorTipo: Role.VET },
      tx as never,
    );

    // A trilha precisa cair junto com a operação que a originou.
    expect(tx.acaoClinica.create).toHaveBeenCalled();
    expect(prisma.acaoClinica.create).not.toHaveBeenCalled();
  });
});
