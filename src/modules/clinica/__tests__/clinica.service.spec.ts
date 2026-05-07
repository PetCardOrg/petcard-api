import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { ClinicaService } from '../clinica.service';

describe('ClinicaService', () => {
  let service: ClinicaService;
  let prisma: { $queryRaw: jest.Mock };

  const now = new Date('2026-05-01T12:00:00Z');

  const fakeRow = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Pet Clínica Aldeota',
    address: 'Av. Dom Luís, 1200',
    phone: '(85) 91111-1001',
    specialty: 'Clínica geral',
    coordinates: { type: 'Point' as const, coordinates: [-38.5099, -3.7358] },
    distance_meters: 1234,
    created_at: now,
    updated_at: now,
  };

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClinicaService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ClinicaService>(ClinicaService);
  });

  describe('findNearby', () => {
    it('returns mapped clinics ordered by distance', async () => {
      prisma.$queryRaw.mockResolvedValue([fakeRow]);

      const result = await service.findNearby({
        lat: -3.7302,
        lng: -38.5217,
        radiusKm: 10,
      });

      expect(result).toEqual([
        {
          id: fakeRow.id,
          name: fakeRow.name,
          address: fakeRow.address,
          phone: fakeRow.phone,
          specialty: fakeRow.specialty,
          coordinates: fakeRow.coordinates,
          distance_meters: 1234,
          created_at: now,
          updated_at: now,
        },
      ]);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('converts radiusKm to meters before querying', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await service.findNearby({
        lat: -3.7302,
        lng: -38.5217,
        radiusKm: 5,
      });

      const callArgs = prisma.$queryRaw.mock.calls[0] as unknown[];
      const params = callArgs.slice(1) as number[];
      expect(params).toContain(5000);
    });

    it('passes lng before lat to ST_MakePoint params', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await service.findNearby({
        lat: -3.7302,
        lng: -38.5217,
        radiusKm: 1,
      });

      const callArgs = prisma.$queryRaw.mock.calls[0] as unknown[];
      const params = callArgs.slice(1) as number[];
      const lngIndex = params.indexOf(-38.5217);
      const latIndex = params.indexOf(-3.7302);
      expect(lngIndex).toBeGreaterThanOrEqual(0);
      expect(latIndex).toBeGreaterThan(lngIndex);
    });

    it('uses default limit=20 and offset=0 when not provided', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await service.findNearby({
        lat: -3.7302,
        lng: -38.5217,
        radiusKm: 1,
      });

      const callArgs = prisma.$queryRaw.mock.calls[0] as unknown[];
      const params = callArgs.slice(1) as number[];
      expect(params).toContain(20);
      expect(params).toContain(0);
    });

    it('forwards explicit limit and offset to the query', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await service.findNearby({
        lat: -3.7302,
        lng: -38.5217,
        radiusKm: 1,
        limit: 5,
        offset: 10,
      });

      const callArgs = prisma.$queryRaw.mock.calls[0] as unknown[];
      const params = callArgs.slice(1) as number[];
      expect(params).toContain(5);
      expect(params).toContain(10);
    });

    it('returns empty array when no clinics are within radius', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      const result = await service.findNearby({
        lat: -3.7302,
        lng: -38.5217,
        radiusKm: 1,
      });

      expect(result).toEqual([]);
    });

    it('maps null phone and specialty to undefined', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { ...fakeRow, phone: null, specialty: null },
      ]);

      const [clinic] = await service.findNearby({
        lat: -3.7302,
        lng: -38.5217,
        radiusKm: 1,
      });

      expect(clinic.phone).toBeUndefined();
      expect(clinic.specialty).toBeUndefined();
    });

    it('executes query without specialty filter when not provided', async () => {
      prisma.$queryRaw.mockResolvedValue([fakeRow]);

      await service.findNearby({
        lat: -3.7302,
        lng: -38.5217,
        radiusKm: 10,
      });

      const callArgs = prisma.$queryRaw.mock.calls[0] as unknown[];
      const params = callArgs.slice(1);
      // When no specialty is provided, Prisma.empty is used — no specialty param object
      const hasSpecialtyFragment = params.some(
        (p) =>
          typeof p === 'object' &&
          p !== null &&
          'strings' in p &&
          (p as { strings: string[] }).strings.some((s: string) =>
            s.includes('LOWER(specialty)'),
          ),
      );
      expect(hasSpecialtyFragment).toBe(false);
    });

    it('applies specialty filter when provided', async () => {
      prisma.$queryRaw.mockResolvedValue([fakeRow]);

      await service.findNearby({
        lat: -3.7302,
        lng: -38.5217,
        radiusKm: 10,
        specialty: 'Clínica geral',
      });

      const callArgs = prisma.$queryRaw.mock.calls[0] as unknown[];
      const params = callArgs.slice(1);
      // Prisma.sql creates a nested fragment with strings and values
      const specialtyFragment = params.find(
        (p) =>
          typeof p === 'object' &&
          p !== null &&
          'strings' in p &&
          (p as { strings: string[] }).strings.some((s: string) =>
            s.includes('LOWER(specialty)'),
          ),
      ) as { strings: string[]; values: string[] } | undefined;
      expect(specialtyFragment).toBeDefined();
      expect(specialtyFragment!.values).toContain('Clínica geral');
    });

    it('returns only matching clinics when specialty filter is used', async () => {
      const ortopediaRow = {
        ...fakeRow,
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Hospital Vet Cocó',
        specialty: 'Ortopedia',
      };
      prisma.$queryRaw.mockResolvedValue([ortopediaRow]);

      const result = await service.findNearby({
        lat: -3.7302,
        lng: -38.5217,
        radiusKm: 10,
        specialty: 'Ortopedia',
      });

      expect(result).toHaveLength(1);
      expect(result[0].specialty).toBe('Ortopedia');
    });

    it('combines distance and specialty filters in the same query', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await service.findNearby({
        lat: -3.7302,
        lng: -38.5217,
        radiusKm: 3,
        specialty: 'Emergência 24h',
      });

      const callArgs = prisma.$queryRaw.mock.calls[0] as unknown[];
      // Check template contains ST_DWithin
      const templateStrings = callArgs[0] as string[];
      const joined = templateStrings.join('');
      expect(joined).toContain('ST_DWithin');

      // Check radiusKm was converted to meters
      const params = callArgs.slice(1);
      expect(params).toContain(3000);

      // Check specialty fragment is present
      const specialtyFragment = params.find(
        (p) =>
          typeof p === 'object' &&
          p !== null &&
          'strings' in p &&
          (p as { strings: string[] }).strings.some((s: string) =>
            s.includes('LOWER(specialty)'),
          ),
      ) as { strings: string[]; values: string[] } | undefined;
      expect(specialtyFragment).toBeDefined();
      expect(specialtyFragment!.values).toContain('Emergência 24h');
    });
  });
});
