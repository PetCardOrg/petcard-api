-- CreateEnum
CREATE TYPE "AcaoClinicaTipo" AS ENUM ('CRIACAO', 'EDICAO', 'EXCLUSAO');

-- CreateEnum
CREATE TYPE "EntidadeClinica" AS ENUM ('NOTA_CLINICA', 'VACINA', 'VERMIFUGO', 'MEDICACAO');

-- AlterTable
ALTER TABLE "deworming_record" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "veterinario_id" TEXT;

-- AlterTable
ALTER TABLE "medication_record" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "veterinario_id" TEXT;

-- AlterTable
ALTER TABLE "nota_clinica" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "vaccine_record" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "veterinario_id" TEXT;

-- CreateTable
CREATE TABLE "acao_clinica" (
    "id" TEXT NOT NULL,
    "pet_id" TEXT NOT NULL,
    "tipo" "AcaoClinicaTipo" NOT NULL,
    "entidade" "EntidadeClinica" NOT NULL,
    "entidade_id" TEXT NOT NULL,
    "autor_tipo" "Role" NOT NULL,
    "autor_id" TEXT NOT NULL,
    "autor_nome" TEXT NOT NULL,
    "autor_crmv" TEXT,
    "detalhes" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acao_clinica_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "acao_clinica_pet_id_created_at_idx" ON "acao_clinica"("pet_id", "created_at");

-- CreateIndex
CREATE INDEX "acao_clinica_entidade_entidade_id_idx" ON "acao_clinica"("entidade", "entidade_id");

-- CreateIndex
CREATE INDEX "deworming_record_veterinario_id_idx" ON "deworming_record"("veterinario_id");

-- CreateIndex
CREATE INDEX "medication_record_veterinario_id_idx" ON "medication_record"("veterinario_id");

-- CreateIndex
CREATE INDEX "vaccine_record_veterinario_id_idx" ON "vaccine_record"("veterinario_id");

-- AddForeignKey
ALTER TABLE "vaccine_record" ADD CONSTRAINT "vaccine_record_veterinario_id_fkey" FOREIGN KEY ("veterinario_id") REFERENCES "veterinario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deworming_record" ADD CONSTRAINT "deworming_record_veterinario_id_fkey" FOREIGN KEY ("veterinario_id") REFERENCES "veterinario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_record" ADD CONSTRAINT "medication_record_veterinario_id_fkey" FOREIGN KEY ("veterinario_id") REFERENCES "veterinario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acao_clinica" ADD CONSTRAINT "acao_clinica_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
