import { PrismaClient, Role, Species, Sex } from '@prisma/client';

const prisma = new PrismaClient();

const tutors = [
  {
    auth0Id: 'auth0|a1b2c3d4e5f6000000000001',
    name: 'Ana Carolina Silva',
    email: 'ana.silva@example.com',
    phone: '+5511987654321',
    role: Role.TUTOR,
  },
  {
    auth0Id: 'auth0|a1b2c3d4e5f6000000000002',
    name: 'Bruno Henrique Costa',
    email: 'bruno.costa@example.com',
    phone: '+5521991234567',
    role: Role.TUTOR,
  },
  {
    auth0Id: 'auth0|a1b2c3d4e5f6000000000003',
    name: 'Dra. Camila Ferreira',
    email: 'camila.ferreira@vet.example.com',
    phone: '+5531988887777',
    role: Role.VET,
  },
];

type PetSeed = {
  name: string;
  species: Species;
  breed: string;
  sex: Sex;
  birthDate: Date;
  weight: number;
  tutorAuth0Id: string;
};

const pets: PetSeed[] = [
  {
    name: 'Thor',
    species: Species.DOG,
    breed: 'Golden Retriever',
    sex: Sex.MALE,
    birthDate: new Date('2021-05-12'),
    weight: 28.5,
    tutorAuth0Id: 'auth0|a1b2c3d4e5f6000000000001',
  },
  {
    name: 'Mel',
    species: Species.DOG,
    breed: 'Shih Tzu',
    sex: Sex.FEMALE,
    birthDate: new Date('2022-09-03'),
    weight: 6.2,
    tutorAuth0Id: 'auth0|a1b2c3d4e5f6000000000001',
  },
  {
    name: 'Luna',
    species: Species.CAT,
    breed: 'Siamês',
    sex: Sex.FEMALE,
    birthDate: new Date('2020-11-20'),
    weight: 4.1,
    tutorAuth0Id: 'auth0|a1b2c3d4e5f6000000000002',
  },
  {
    name: 'Simba',
    species: Species.CAT,
    breed: 'SRD',
    sex: Sex.MALE,
    birthDate: new Date('2023-02-14'),
    weight: 3.8,
    tutorAuth0Id: 'auth0|a1b2c3d4e5f6000000000002',
  },
  {
    name: 'Kiko',
    species: Species.BIRD,
    breed: 'Calopsita',
    sex: Sex.MALE,
    birthDate: new Date('2023-06-01'),
    weight: 0.09,
    tutorAuth0Id: 'auth0|a1b2c3d4e5f6000000000001',
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
    notes: 'Tratamento de infecção de pele',
  },
  {
    petName: 'Mel',
    medicationName: 'Meloxicam',
    dosage: '0.1mg/kg',
    frequency: '1x ao dia',
    startDate: new Date('2026-01-15'),
    endDate: new Date('2026-01-20'),
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

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  await prisma.$transaction(async (tx) => {
    for (const tutor of tutors) {
      await tx.tutor.upsert({
        where: { auth0Id: tutor.auth0Id },
        update: {
          name: tutor.name,
          email: tutor.email,
          phone: tutor.phone,
          role: tutor.role,
        },
        create: tutor,
      });
    }
    console.log(`✅ ${tutors.length} tutores criados/atualizados`);

    const tutorByAuth0 = new Map<string, string>();
    for (const t of await tx.tutor.findMany()) {
      tutorByAuth0.set(t.auth0Id, t.id);
    }

    for (const pet of pets) {
      const tutorId = tutorByAuth0.get(pet.tutorAuth0Id);
      if (!tutorId)
        throw new Error(`Tutor não encontrado: ${pet.tutorAuth0Id}`);

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
          notes: m.notes,
        },
      });
    }
    console.log(`✅ ${medications.length} registros de medicação criados`);
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
