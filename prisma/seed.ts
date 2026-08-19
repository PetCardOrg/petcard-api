import { PrismaClient, Role, Species, Sex } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SEED_PASSWORD = 'petcard123';

const tutors = [
  {
    name: 'Ana Carolina Silva',
    email: 'ana.silva@example.com',
    phone: '+5511987654321',
    role: Role.TUTOR,
  },
  {
    name: 'Bruno Henrique Costa',
    email: 'bruno.costa@example.com',
    phone: '+5521991234567',
    role: Role.TUTOR,
  },
  {
    name: 'Dra. Camila Ferreira',
    email: 'camila.ferreira@vet.example.com',
    phone: '+5531988887777',
    role: Role.VET,
  },
];

/**
 * Veterinários vivem em tabela própria, com CRMV e login separado
 * (`POST /auth/veterinario/login`) — não são tutores com papel VET.
 */
const veterinarios = [
  {
    nome: 'Dra. Camila Ferreira',
    email: 'camila.ferreira@vet.example.com',
    crmv: 'CRMV-SP 12345',
    telefone: '+5531988887777',
  },
  {
    // CRMV reservado que o validador stub recusa: permite demonstrar o
    // bloqueio de acesso clínico sem depender da consulta externa (api#113).
    nome: 'Dr. Marcos Andrade',
    email: 'marcos.andrade@vet.example.com',
    crmv: 'CRMV-SP 00000',
    telefone: '+5531977776666',
  },
];

type PetSeed = {
  name: string;
  species: Species;
  breed: string;
  sex: Sex;
  birthDate: Date;
  weight: number;
  tutorEmail: string;
};

const pets: PetSeed[] = [
  {
    name: 'Thor',
    species: Species.DOG,
    breed: 'Golden Retriever',
    sex: Sex.MALE,
    birthDate: new Date('2021-05-12'),
    weight: 28.5,
    tutorEmail: 'ana.silva@example.com',
  },
  {
    name: 'Mel',
    species: Species.DOG,
    breed: 'Shih Tzu',
    sex: Sex.FEMALE,
    birthDate: new Date('2022-09-03'),
    weight: 6.2,
    tutorEmail: 'ana.silva@example.com',
  },
  {
    name: 'Luna',
    species: Species.CAT,
    breed: 'Siamês',
    sex: Sex.FEMALE,
    birthDate: new Date('2020-11-20'),
    weight: 4.1,
    tutorEmail: 'bruno.costa@example.com',
  },
  {
    name: 'Simba',
    species: Species.CAT,
    breed: 'SRD',
    sex: Sex.MALE,
    birthDate: new Date('2023-02-14'),
    weight: 3.8,
    tutorEmail: 'bruno.costa@example.com',
  },
  {
    name: 'Kiko',
    species: Species.BIRD,
    breed: 'Calopsita',
    sex: Sex.MALE,
    birthDate: new Date('2023-06-01'),
    weight: 0.09,
    tutorEmail: 'ana.silva@example.com',
  },
];

type VaccineSeed = {
  petName: string;
  vaccineName: string;
  appliedAt: Date;
  nextDoseAt: Date;
  veterinarianName: string;
  notes?: string;
};

const vaccines: VaccineSeed[] = [
  {
    petName: 'Thor',
    vaccineName: 'V10 (Déchavoxin)',
    appliedAt: new Date('2025-06-10'),
    nextDoseAt: new Date('2026-06-10'),
    veterinarianName: 'Dra. Camila Ferreira',
  },
  {
    petName: 'Thor',
    vaccineName: 'Antirrábica',
    appliedAt: new Date('2025-07-15'),
    nextDoseAt: new Date('2026-07-15'),
    veterinarianName: 'Dra. Camila Ferreira',
  },
  {
    petName: 'Mel',
    vaccineName: 'V8',
    appliedAt: new Date('2025-08-20'),
    nextDoseAt: new Date('2026-08-20'),
    veterinarianName: 'Dr. Paulo Ribeiro',
  },
  {
    petName: 'Luna',
    vaccineName: 'Tríplice Felina',
    appliedAt: new Date('2025-05-05'),
    nextDoseAt: new Date('2026-05-05'),
    veterinarianName: 'Dra. Camila Ferreira',
  },
  {
    petName: 'Luna',
    vaccineName: 'Antirrábica',
    appliedAt: new Date('2025-05-05'),
    nextDoseAt: new Date('2026-05-05'),
    veterinarianName: 'Dra. Camila Ferreira',
  },
  {
    petName: 'Simba',
    vaccineName: 'Quádrupla Felina',
    appliedAt: new Date('2025-09-12'),
    nextDoseAt: new Date('2026-09-12'),
    veterinarianName: 'Dr. Paulo Ribeiro',
    notes: 'Primeira dose do reforço anual',
  },
];

type DewormingSeed = {
  petName: string;
  productName: string;
  appliedAt: Date;
  nextDoseAt: Date;
  veterinarianName?: string;
  notes?: string;
};

const dewormings: DewormingSeed[] = [
  {
    petName: 'Thor',
    productName: 'Drontal Plus',
    appliedAt: new Date('2025-10-01'),
    nextDoseAt: new Date('2026-01-01'),
    notes: 'Peso no momento: 28kg',
  },
  {
    petName: 'Mel',
    productName: 'Milbemax',
    appliedAt: new Date('2025-10-10'),
    nextDoseAt: new Date('2026-01-10'),
    notes: 'Peso no momento: 6kg',
  },
  {
    petName: 'Luna',
    productName: 'Vermivet Gatos',
    appliedAt: new Date('2025-09-20'),
    nextDoseAt: new Date('2025-12-20'),
    notes: 'Peso no momento: 4kg',
  },
  {
    petName: 'Simba',
    productName: 'Drontal Gatos',
    appliedAt: new Date('2025-11-05'),
    nextDoseAt: new Date('2026-02-05'),
    veterinarianName: 'Dra. Camila Ferreira',
    notes: 'Peso no momento: 3.8kg',
  },
];

type MedicationSeed = {
  petName: string;
  medicationName: string;
  dosage: string;
  frequency: string;
  startDate: Date;
  endDate?: Date;
  veterinarianName?: string;
  notes?: string;
};

const medications: MedicationSeed[] = [
  {
    petName: 'Thor',
    medicationName: 'Amoxicilina + Clavulanato',
    dosage: '500mg',
    frequency: '12/12h',
    startDate: new Date('2025-12-01'),
    endDate: new Date('2025-12-10'),
    veterinarianName: 'Dra. Camila Ferreira',
    notes: 'Tratamento de infecção de pele',
  },
  {
    petName: 'Mel',
    medicationName: 'Meloxicam',
    dosage: '0.1mg/kg',
    frequency: '1x ao dia',
    startDate: new Date('2026-01-15'),
    endDate: new Date('2026-01-20'),
    veterinarianName: 'Dr. Paulo Ribeiro',
    notes: 'Anti-inflamatório pós cirurgia',
  },
  {
    petName: 'Luna',
    medicationName: 'Omega 3 Vetnil',
    dosage: '1 cápsula',
    frequency: '1x ao dia',
    startDate: new Date('2026-02-01'),
    notes: 'Suplementação contínua para pelagem',
  },
  {
    petName: 'Simba',
    medicationName: 'Metronidazol',
    dosage: '25mg',
    frequency: '12/12h',
    startDate: new Date('2026-03-10'),
    endDate: new Date('2026-03-17'),
    notes: 'Tratamento de giárdia',
  },
];

interface RegistroDoVet {
  veterinarioId: string | null;
  petId: string;
}

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  const hashedPassword = await bcrypt.hash(SEED_PASSWORD, 10);

  await prisma.$transaction(async (tx) => {
    for (const tutor of tutors) {
      await tx.tutor.upsert({
        where: { email: tutor.email },
        update: {
          name: tutor.name,
          phone: tutor.phone,
          role: tutor.role,
        },
        create: { ...tutor, password: hashedPassword },
      });
    }
    console.log(
      `✅ ${tutors.length} tutores criados/atualizados (senha: ${SEED_PASSWORD})`,
    );

    for (const vet of veterinarios) {
      await tx.veterinario.upsert({
        where: { email: vet.email },
        update: { nome: vet.nome, crmv: vet.crmv, telefone: vet.telefone },
        create: { ...vet, password: hashedPassword },
      });
    }
    console.log(
      `✅ ${veterinarios.length} veterinários criados/atualizados (senha: ${SEED_PASSWORD})`,
    );

    const tutorByEmail = new Map<string, string>();
    for (const t of await tx.tutor.findMany()) {
      tutorByEmail.set(t.email, t.id);
    }

    for (const pet of pets) {
      const tutorId = tutorByEmail.get(pet.tutorEmail);
      if (!tutorId) throw new Error(`Tutor não encontrado: ${pet.tutorEmail}`);

      const existing = await tx.pet.findFirst({
        where: { name: pet.name, tutorId },
      });

      const data = {
        name: pet.name,
        species: pet.species,
        breed: pet.breed,
        sex: pet.sex,
        birthDate: pet.birthDate,
        weight: pet.weight,
        tutorId,
      };

      if (existing) {
        await tx.pet.update({ where: { id: existing.id }, data });
      } else {
        await tx.pet.create({ data });
      }
    }
    console.log(`✅ ${pets.length} pets criados/atualizados`);

    const petByName = new Map<string, string>();
    for (const p of await tx.pet.findMany()) {
      petByName.set(p.name, p.id);
    }

    /**
     * Liga o registro ao veterinário do PetCard quando o nome corresponde a
     * uma conta existente.
     *
     * Sem isso, os registros do seed ficam com `veterinarioId` nulo e a regra
     * de autoria (web#34) os trata como declarados pelo tutor: a Dra. Camila
     * via o próprio nome no registro e mesmo assim não podia editá-lo.
     *
     * "Dr. Paulo Ribeiro" não tem conta de propósito — é o caso do
     * profissional de fora, que continua valendo como texto livre.
     */
    const vetIdByNome = new Map<string, string>();
    for (const vet of await tx.veterinario.findMany()) {
      vetIdByNome.set(vet.nome, vet.id);
    }

    // Idempotência: limpar e recriar registros de saúde (evita duplicar)
    await tx.vaccineRecord.deleteMany();
    await tx.dewormingRecord.deleteMany();
    await tx.medicationRecord.deleteMany();

    for (const v of vaccines) {
      const petId = petByName.get(v.petName);
      if (!petId) throw new Error(`Pet não encontrado: ${v.petName}`);
      await tx.vaccineRecord.create({
        data: {
          petId,
          vaccineName: v.vaccineName,
          appliedAt: v.appliedAt,
          nextDoseAt: v.nextDoseAt,
          veterinarianName: v.veterinarianName,
          veterinarioId: v.veterinarianName
            ? (vetIdByNome.get(v.veterinarianName) ?? null)
            : null,
          notes: v.notes,
        },
      });
    }
    console.log(`✅ ${vaccines.length} registros de vacina criados`);

    for (const d of dewormings) {
      const petId = petByName.get(d.petName);
      if (!petId) throw new Error(`Pet não encontrado: ${d.petName}`);
      await tx.dewormingRecord.create({
        data: {
          petId,
          productName: d.productName,
          appliedAt: d.appliedAt,
          nextDoseAt: d.nextDoseAt,
          veterinarianName: d.veterinarianName,
          veterinarioId: d.veterinarianName
            ? (vetIdByNome.get(d.veterinarianName) ?? null)
            : null,
          notes: d.notes,
        },
      });
    }
    console.log(`✅ ${dewormings.length} registros de vermifugação criados`);

    for (const m of medications) {
      const petId = petByName.get(m.petName);
      if (!petId) throw new Error(`Pet não encontrado: ${m.petName}`);
      await tx.medicationRecord.create({
        data: {
          petId,
          medicationName: m.medicationName,
          dosage: m.dosage,
          frequency: m.frequency,
          startDate: m.startDate,
          endDate: m.endDate,
          veterinarianName: m.veterinarianName,
          veterinarioId: m.veterinarianName
            ? (vetIdByNome.get(m.veterinarianName) ?? null)
            : null,
          notes: m.notes,
        },
      });
    }
    console.log(`✅ ${medications.length} registros de medicação criados`);

    /**
     * Vincula ao veterinário os pets em que ele registrou algo.
     *
     * O dashboard do vet lê do vínculo, não dos registros. O seed grava
     * direto pelo Prisma, sem passar pelos serviços que criam o vínculo, então
     * sem isto a Dra. Camila abriria a demo com o dashboard vazio.
     */
    const vinculos = new Map<
      string,
      { veterinarioId: string; petId: string }
    >();
    for (const modelo of [
      tx.vaccineRecord,
      tx.dewormingRecord,
      tx.medicationRecord,
      tx.notaClinica,
    ]) {
      const registros = await (
        modelo as { findMany: (args: unknown) => Promise<RegistroDoVet[]> }
      ).findMany({ select: { veterinarioId: true, petId: true } });
      for (const r of registros) {
        if (!r.veterinarioId) continue;
        vinculos.set(`${r.veterinarioId}:${r.petId}`, {
          veterinarioId: r.veterinarioId,
          petId: r.petId,
        });
      }
    }

    await tx.petAtendido.deleteMany();
    for (const vinculo of vinculos.values()) {
      await tx.petAtendido.create({ data: vinculo });
    }
    console.log(`✅ ${vinculos.size} vínculos veterinário↔pet criados`);
  });

  console.log('🌱 Seed concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
