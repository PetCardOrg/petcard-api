import { PrismaClient, Role, Species, Sex } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Clínicas fictícias com coordenadas reais de Fortaleza/CE.
 * Uso exclusivo para desenvolvimento e demo do TCC — nomes, telefones e
 * endereços são sintéticos. Coordenadas são plausíveis para os bairros nominais
 * para que buscas geoespaciais (ST_DWithin) retornem resultados realistas.
 */
type ClinicSeed = {
  name: string;
  address: string;
  phone: string;
  specialty: string;
  lat: number;
  lng: number;
};

const clinics: ClinicSeed[] = [
  {
    name: 'Pet Clínica Aldeota',
    address: 'Av. Dom Luís, 1200 - Aldeota, Fortaleza/CE',
    phone: '(85) 91111-1001',
    specialty: 'Clínica geral',
    lat: -3.7358,
    lng: -38.5099,
  },
  {
    name: 'Veterinária Meireles 24h',
    address: 'Av. Beira Mar, 2500 - Meireles, Fortaleza/CE',
    phone: '(85) 91111-1002',
    specialty: 'Emergência 24h',
    lat: -3.7271,
    lng: -38.4946,
  },
  {
    name: 'Hospital Vet Cocó',
    address: 'Av. Engenheiro Santana Júnior, 800 - Cocó, Fortaleza/CE',
    phone: '(85) 91111-1003',
    specialty: 'Ortopedia',
    lat: -3.7589,
    lng: -38.4784,
  },
  {
    name: 'Centro Veterinário Benfica',
    address: 'Av. da Universidade, 2300 - Benfica, Fortaleza/CE',
    phone: '(85) 91111-1004',
    specialty: 'Clínica geral',
    lat: -3.7375,
    lng: -38.5422,
  },
  {
    name: 'Clínica Animal Centro',
    address: 'Rua Floriano Peixoto, 950 - Centro, Fortaleza/CE',
    phone: '(85) 91111-1005',
    specialty: 'Dermatologia',
    lat: -3.73,
    lng: -38.5219,
  },
  {
    name: 'Pet Saúde Papicu',
    address: 'Av. Engenheiro Santana Júnior, 100 - Papicu, Fortaleza/CE',
    phone: '(85) 91111-1006',
    specialty: 'Exóticos',
    lat: -3.7463,
    lng: -38.477,
  },
  {
    name: 'Vetcare Mucuripe',
    address: 'Av. Vicente de Castro, 500 - Mucuripe, Fortaleza/CE',
    phone: '(85) 91111-1007',
    specialty: 'Emergência 24h',
    lat: -3.7247,
    lng: -38.4856,
  },
  {
    name: 'Clínica Varjota Pet',
    address: 'Rua Frederico Borges, 300 - Varjota, Fortaleza/CE',
    phone: '(85) 91111-1008',
    specialty: 'Dermatologia',
    lat: -3.7351,
    lng: -38.494,
  },
  {
    name: 'Animal Plus Dionísio Torres',
    address: 'Av. Pontes Vieira, 1500 - Dionísio Torres, Fortaleza/CE',
    phone: '(85) 91111-1009',
    specialty: 'Ortopedia',
    lat: -3.7425,
    lng: -38.5125,
  },
  {
    name: 'Veterinária Parquelândia',
    address: 'Av. Bezerra de Menezes, 2100 - Parquelândia, Fortaleza/CE',
    phone: '(85) 91111-1010',
    specialty: 'Exóticos',
    lat: -3.7408,
    lng: -38.5471,
  },
  {
    name: 'Pet Hospital Montese',
    address: 'Av. Godofredo Maciel, 900 - Montese, Fortaleza/CE',
    phone: '(85) 91111-1011',
    specialty: 'Ortopedia',
    lat: -3.7691,
    lng: -38.5501,
  },
  {
    name: 'Clínica Veterinária Messejana',
    address: 'Av. Frei Cirilo, 400 - Messejana, Fortaleza/CE',
    phone: '(85) 91111-1012',
    specialty: 'Exóticos',
    lat: -3.8343,
    lng: -38.4979,
  },
];

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

    for (const c of clinics) {
      const existing = await tx.clinic.findFirst({ where: { name: c.name } });

      const data = {
        name: c.name,
        address: c.address,
        phone: c.phone,
        specialty: c.specialty,
      };

      const id = existing
        ? (await tx.clinic.update({ where: { id: existing.id }, data })).id
        : (await tx.clinic.create({ data })).id;

      // coordinates é Unsupported("geography(Point, 4326)") — Prisma Client
      // não consegue ler/escrever; setamos via SQL raw. Ordem em ST_MakePoint
      // é (longitude, latitude), não o contrário.
      await tx.$executeRaw`
        UPDATE clinica
        SET coordinates = ST_SetSRID(ST_MakePoint(${c.lng}, ${c.lat}), 4326)::geography
        WHERE id = ${id}
      `;
    }
    console.log(`✅ ${clinics.length} clínicas criadas/atualizadas`);
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
