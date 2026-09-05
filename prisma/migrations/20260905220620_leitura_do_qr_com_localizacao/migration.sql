-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'PET_SCAN';

-- CreateTable
CREATE TABLE "pet_scan" (
    "id" TEXT NOT NULL,
    "pet_id" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy_meters" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_scan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pet_scan_pet_id_created_at_idx" ON "pet_scan"("pet_id", "created_at");

-- AddForeignKey
ALTER TABLE "pet_scan" ADD CONSTRAINT "pet_scan_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
