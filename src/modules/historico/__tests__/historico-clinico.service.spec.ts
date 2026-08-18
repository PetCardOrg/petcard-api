import { Test, TestingModule } from '@nestjs/testing';
import { AcaoClinicaTipo, EntidadeClinica, Role } from '@petcardorg/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { PetService } from '../../pet/pet.service';
import { HistoricoClinicoService } from '../historico-clinico.service';

describe('HistoricoClinicoService', () => {
  let service: HistoricoClinicoService;
  let prisma: {
    notaClinica: { findMany: jest.Mock };
    vaccineRecord: { findMany: jest.Mock };
    dewormingRecord: { findMany: jest.Mock };
    medicationRecord: { findMany: jest.Mock };
    acaoClinica: { findMany: jest.Mock };
  };
  let petService: { assertAccess: jest.Mock };

  const vet = {
    id: 'vet-1',
    nome: 'Dra. Camila',
    crmv: 'CRMV-SP 12345',
  };

  const medicacaoExcluida = {
    id: 'med-1',
    petId: 'pet-1',
    medicationName: 'Amoxicilina',
    dosage: '250mg',
    frequency: '12/12h',
    startDate: new Date('2026-03-10'),
    endDate: null,
    createdAt: new Date('2026-03-10'),
    deletedAt: new Date('2026-03-11'),
    veterinario: vet,
  };

  beforeEach(async () => {
    prisma = {
      notaClinica: { findMany: jest.fn().mockResolvedValue([]) },
      vaccineRecord: { findMany: jest.fn().mockResolvedValue([]) },
      dewormingRecord: { findMany: jest.fn().mockResolvedValue([]) },
      medicationRecord: { findMany: jest.fn().mockResolvedValue([]) },
      acaoClinica: { findMany: jest.fn().mockResolvedValue([]) },
    };
    petService = {
      assertAccess: jest.fn().mockResolvedValue({ id: 'pet-1', name: 'Rex' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HistoricoClinicoService,
        { provide: PrismaService, useValue: prisma },
        { provide: PetService, useValue: petService },
      ],
    }).compile();

    service = module.get<HistoricoClinicoService>(HistoricoClinicoService);
  });

  it('inclui registro excluído, marcado como tal', async () => {
    prisma.medicationRecord.findMany.mockResolvedValue([medicacaoExcluida]);

    const resultado = await service.doPet('pet-1', 'tutor-1', false);

    // O ponto da issue: o tutor apagou, mas a prescrição segue demonstrável.
    expect(resultado.itens).toHaveLength(1);
    expect(resultado.itens[0]).toMatchObject({
      entidade: EntidadeClinica.MEDICACAO,
      titulo: 'Amoxicilina',
      excluido: true,
      excluido_em: medicacaoExcluida.deletedAt,
      veterinario_crmv: 'CRMV-SP 12345',
    });
  });

  it('não filtra excluídos na consulta — é o oposto das listagens', async () => {
    await service.doPet('pet-1', 'tutor-1', false);

    for (const modelo of [
      prisma.notaClinica,
      prisma.vaccineRecord,
      prisma.dewormingRecord,
      prisma.medicationRecord,
    ]) {
      const [[chamada]] = modelo.findMany.mock.calls as Array<
        [{ where: Record<string, unknown> }]
      >;
      expect(chamada.where).not.toHaveProperty('deletedAt');
    }
  });

  it('anexa a trilha de ações ao registro correspondente', async () => {
    prisma.medicationRecord.findMany.mockResolvedValue([medicacaoExcluida]);
    prisma.acaoClinica.findMany.mockResolvedValue([
      {
        id: 'acao-1',
        entidade: EntidadeClinica.MEDICACAO,
        entidadeId: 'med-1',
        tipo: AcaoClinicaTipo.EXCLUSAO,
        autorTipo: Role.TUTOR,
        autorId: 'tutor-1',
        autorNome: 'Ana Silva',
        autorCrmv: null,
        createdAt: new Date('2026-03-11'),
      },
      {
        id: 'acao-2',
        entidade: EntidadeClinica.VACINA,
        entidadeId: 'outra',
        tipo: AcaoClinicaTipo.CRIACAO,
        autorTipo: Role.VET,
        autorId: 'vet-1',
        autorNome: 'Dra. Camila',
        autorCrmv: 'CRMV-SP 12345',
        createdAt: new Date('2026-03-01'),
      },
    ]);

    const resultado = await service.doPet('pet-1', 'tutor-1', false);

    // Só a ação daquela entidade, não a da vacina.
    expect(resultado.itens[0].acoes).toHaveLength(1);
    expect(resultado.itens[0].acoes[0]).toMatchObject({
      tipo: AcaoClinicaTipo.EXCLUSAO,
      autor_nome: 'Ana Silva',
      autor_crmv: undefined,
    });
  });

  it('ordena a linha do tempo do mais recente para o mais antigo', async () => {
    prisma.vaccineRecord.findMany.mockResolvedValue([
      {
        id: 'vac-1',
        petId: 'pet-1',
        vaccineName: 'Antirrábica',
        appliedAt: new Date('2026-01-05'),
        notes: null,
        createdAt: new Date('2026-01-05'),
        deletedAt: null,
        veterinarianName: 'Dr. Externo',
        veterinario: null,
      },
    ]);
    prisma.medicationRecord.findMany.mockResolvedValue([medicacaoExcluida]);

    const resultado = await service.doPet('pet-1', 'tutor-1', false);

    expect(resultado.itens.map((i) => i.entidade)).toEqual([
      EntidadeClinica.MEDICACAO,
      EntidadeClinica.VACINA,
    ]);
  });

  it('usa o nome livre quando não há veterinário do PetCard', async () => {
    prisma.vaccineRecord.findMany.mockResolvedValue([
      {
        id: 'vac-1',
        petId: 'pet-1',
        vaccineName: 'V8',
        appliedAt: new Date('2026-01-05'),
        notes: null,
        createdAt: new Date('2026-01-05'),
        deletedAt: null,
        veterinarianName: 'Dr. Externo',
        veterinario: null,
      },
    ]);

    const resultado = await service.doPet('pet-1', 'tutor-1', false);

    // Sem FK não há atribuição confiável nem CRMV — só o nome digitado.
    expect(resultado.itens[0].veterinario_nome).toBe('Dr. Externo');
    expect(resultado.itens[0].veterinario_id).toBeUndefined();
    expect(resultado.itens[0].veterinario_crmv).toBeUndefined();
  });

  it('monta nota clínica e vermífugo na linha do tempo', async () => {
    prisma.notaClinica.findMany.mockResolvedValue([
      {
        id: 'nota-1',
        petId: 'pet-1',
        diagnostico: 'Otite externa',
        prescricao: 'Antibiótico 7 dias',
        observacoes: null,
        createdAt: new Date('2026-04-01'),
        deletedAt: null,
        veterinario: vet,
      },
    ]);
    prisma.dewormingRecord.findMany.mockResolvedValue([
      {
        id: 'verm-1',
        petId: 'pet-1',
        productName: 'Drontal',
        appliedAt: new Date('2026-02-01'),
        notes: 'Dose única',
        createdAt: new Date('2026-02-01'),
        deletedAt: null,
        veterinarianName: null,
        veterinario: vet,
      },
    ]);

    const resultado = await service.doPet('pet-1', 'tutor-1', false);

    const nota = resultado.itens.find(
      (i) => i.entidade === EntidadeClinica.NOTA_CLINICA,
    );
    // O diagnóstico é o título; a prescrição vira a descrição.
    expect(nota).toMatchObject({
      titulo: 'Otite externa',
      descricao: 'Antibiótico 7 dias',
      excluido: false,
      veterinario_crmv: 'CRMV-SP 12345',
    });

    const verm = resultado.itens.find(
      (i) => i.entidade === EntidadeClinica.VERMIFUGO,
    );
    expect(verm).toMatchObject({
      titulo: 'Drontal',
      descricao: 'Dose única',
      excluido: false,
    });
  });

  it('cai nas observações quando a nota não tem prescrição', async () => {
    prisma.notaClinica.findMany.mockResolvedValue([
      {
        id: 'nota-2',
        petId: 'pet-1',
        diagnostico: 'Revisão',
        prescricao: null,
        observacoes: 'Retornar em 30 dias',
        createdAt: new Date('2026-04-02'),
        deletedAt: null,
        veterinario: vet,
      },
    ]);

    const resultado = await service.doPet('pet-1', 'tutor-1', false);

    expect(resultado.itens[0].descricao).toBe('Retornar em 30 dias');
  });

  it('respeita a autorização de acesso ao pet', async () => {
    petService.assertAccess.mockRejectedValue(new Error('sem acesso'));

    await expect(service.doPet('pet-1', 'outro', false)).rejects.toThrow(
      'sem acesso',
    );
  });
});
