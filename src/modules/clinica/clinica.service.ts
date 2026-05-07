import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ClinicaCoordinates,
  ClinicaResponseDto,
  FindNearbyClinicsQueryDto,
} from '@petcardorg/shared';
import { PrismaService } from '../../prisma/prisma.service';

type NearbyRow = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  specialty: string | null;
  coordinates: ClinicaCoordinates;
  distance_meters: number;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class ClinicaService {
  constructor(private readonly prisma: PrismaService) {}

  async findNearby(
    query: FindNearbyClinicsQueryDto,
  ): Promise<ClinicaResponseDto[]> {
    const radiusMeters = query.radiusKm * 1000;
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const rows = await this.queryNearby(
      query.lng,
      query.lat,
      radiusMeters,
      limit,
      offset,
      query.specialty,
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      address: row.address,
      phone: row.phone ?? undefined,
      specialty: row.specialty ?? undefined,
      coordinates: row.coordinates,
      distance_meters: row.distance_meters,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  private queryNearby(
    lng: number,
    lat: number,
    radiusMeters: number,
    limit: number,
    offset: number,
    specialty?: string,
  ): Promise<NearbyRow[]> {
    const specialtyFilter = specialty
      ? Prisma.sql`AND LOWER(specialty) = LOWER(${specialty})`
      : Prisma.empty;

    return this.prisma.$queryRaw<NearbyRow[]>`
      SELECT
        id,
        name,
        address,
        phone,
        specialty,
        ST_AsGeoJSON(coordinates)::json AS coordinates,
        ROUND(
          ST_Distance(coordinates, ST_MakePoint(${lng}, ${lat})::geography)
        )::int AS distance_meters,
        created_at,
        updated_at
      FROM clinica
      WHERE coordinates IS NOT NULL
        AND ST_DWithin(
          coordinates,
          ST_MakePoint(${lng}, ${lat})::geography,
          ${radiusMeters}
        )
        ${specialtyFilter}
      ORDER BY ST_Distance(
        coordinates,
        ST_MakePoint(${lng}, ${lat})::geography
      ) ASC
      LIMIT ${limit} OFFSET ${offset};
    `;
  }
}
