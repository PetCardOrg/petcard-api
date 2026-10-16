-- Comprovantes (foto da carteirinha, receita, PDF) de vacina, vermífugo e
-- medicação, com verificação por veterinário.
--
-- Escrito à mão: o Prisma não modela o CHECK que garante que cada anexo aponta
-- para exatamente um registro.

-- AlterEnum
ALTER TYPE "AcaoClinicaTipo" ADD VALUE 'ANEXO_ADICIONADO';
ALTER TYPE "AcaoClinicaTipo" ADD VALUE 'ANEXO_REMOVIDO';
ALTER TYPE "AcaoClinicaTipo" ADD VALUE 'ANEXO_VERIFICADO';

-- CreateTable
CREATE TABLE "anexo_clinico" (
    "id" TEXT NOT NULL,
    "pet_id" TEXT NOT NULL,
    "vaccine_record_id" TEXT,
    "deworming_record_id" TEXT,
    "medication_record_id" TEXT,
    "s3_key" TEXT NOT NULL,
    "nome_arquivo" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "tamanho_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "enviado_por_tipo" "Role" NOT NULL,
    "enviado_por_id" TEXT NOT NULL,
    "enviado_por_nome" TEXT NOT NULL,
    "verificado_em" TIMESTAMP(3),
    "verificado_por_id" TEXT,
    "verificado_por_nome" TEXT,
    "verificado_por_crmv" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "anexo_clinico_pkey" PRIMARY KEY ("id"),

    -- Exatamente um registro por anexo: nem órfão, nem duplo.
    CONSTRAINT "anexo_clinico_um_registro" CHECK (
        (("vaccine_record_id" IS NOT NULL)::int
       + ("deworming_record_id" IS NOT NULL)::int
       + ("medication_record_id" IS NOT NULL)::int) = 1
    ),

    -- Verificação é tudo ou nada: sem data não há quem verificou, e vice-versa.
    -- `verificado_por_id` fica de fora porque a FK vira NULL se a conta do
    -- veterinário for excluída, e nome e CRMV gravados continuam valendo.
    CONSTRAINT "anexo_clinico_verificacao_completa" CHECK (
        ("verificado_em" IS NULL AND "verificado_por_nome" IS NULL AND "verificado_por_crmv" IS NULL)
     OR ("verificado_em" IS NOT NULL AND "verificado_por_nome" IS NOT NULL AND "verificado_por_crmv" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "anexo_clinico_s3_key_key" ON "anexo_clinico"("s3_key");

-- CreateIndex
CREATE INDEX "anexo_clinico_pet_id_idx" ON "anexo_clinico"("pet_id");

-- CreateIndex
CREATE INDEX "anexo_clinico_vaccine_record_id_idx" ON "anexo_clinico"("vaccine_record_id");

-- CreateIndex
CREATE INDEX "anexo_clinico_deworming_record_id_idx" ON "anexo_clinico"("deworming_record_id");

-- CreateIndex
CREATE INDEX "anexo_clinico_medication_record_id_idx" ON "anexo_clinico"("medication_record_id");

-- CreateIndex
CREATE INDEX "anexo_clinico_verificado_por_id_idx" ON "anexo_clinico"("verificado_por_id");

-- AddForeignKey
ALTER TABLE "anexo_clinico" ADD CONSTRAINT "anexo_clinico_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexo_clinico" ADD CONSTRAINT "anexo_clinico_vaccine_record_id_fkey" FOREIGN KEY ("vaccine_record_id") REFERENCES "vaccine_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexo_clinico" ADD CONSTRAINT "anexo_clinico_deworming_record_id_fkey" FOREIGN KEY ("deworming_record_id") REFERENCES "deworming_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexo_clinico" ADD CONSTRAINT "anexo_clinico_medication_record_id_fkey" FOREIGN KEY ("medication_record_id") REFERENCES "medication_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexo_clinico" ADD CONSTRAINT "anexo_clinico_verificado_por_id_fkey" FOREIGN KEY ("verificado_por_id") REFERENCES "veterinario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
