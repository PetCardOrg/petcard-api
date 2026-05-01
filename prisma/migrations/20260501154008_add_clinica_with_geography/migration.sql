-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateTable
CREATE TABLE "clinica" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "specialty" TEXT,
    "coordinates" geography(Point, 4326),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinica_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: spatial index for geographic queries (ST_DWithin, etc.)
CREATE INDEX "clinica_coordinates_idx" ON "clinica" USING GIST ("coordinates");