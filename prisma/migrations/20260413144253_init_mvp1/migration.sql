-- CreateEnum
CREATE TYPE "Role" AS ENUM ('TUTOR', 'VET');

-- CreateEnum
CREATE TYPE "Species" AS ENUM ('DOG', 'CAT', 'BIRD', 'OTHER');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE');

-- CreateTable
CREATE TABLE "tutor" (
    "id" TEXT NOT NULL,
    "auth0_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "profile_image_url" TEXT,
    "role" "Role" NOT NULL DEFAULT 'TUTOR',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species" "Species" NOT NULL,
    "breed" TEXT,
    "sex" "Sex" NOT NULL,
    "birth_date" TIMESTAMP(3),
    "weight" DOUBLE PRECISION,
    "photo_url" TEXT,
    "tutor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaccine_record" (
    "id" TEXT NOT NULL,
    "pet_id" TEXT NOT NULL,
    "vaccine_name" TEXT NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL,
    "next_dose_at" TIMESTAMP(3),
    "veterinarian_name" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vaccine_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deworming_record" (
    "id" TEXT NOT NULL,
    "pet_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL,
    "next_dose_at" TIMESTAMP(3),
    "veterinarian_name" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deworming_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_record" (
    "id" TEXT NOT NULL,
    "pet_id" TEXT NOT NULL,
    "medication_name" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medication_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tutor_auth0_id_key" ON "tutor"("auth0_id");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_email_key" ON "tutor"("email");

-- AddForeignKey
ALTER TABLE "pet" ADD CONSTRAINT "pet_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "tutor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccine_record" ADD CONSTRAINT "vaccine_record_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deworming_record" ADD CONSTRAINT "deworming_record_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_record" ADD CONSTRAINT "medication_record_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
