-- CreateTable
CREATE TABLE "pet_atendido" (
    "id" TEXT NOT NULL,
    "veterinario_id" TEXT NOT NULL,
    "pet_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_acesso_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_atendido_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pet_atendido_veterinario_id_ultimo_acesso_em_idx" ON "pet_atendido"("veterinario_id", "ultimo_acesso_em");

-- CreateIndex
CREATE UNIQUE INDEX "pet_atendido_veterinario_id_pet_id_key" ON "pet_atendido"("veterinario_id", "pet_id");

-- AddForeignKey
ALTER TABLE "pet_atendido" ADD CONSTRAINT "pet_atendido_veterinario_id_fkey" FOREIGN KEY ("veterinario_id") REFERENCES "veterinario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_atendido" ADD CONSTRAINT "pet_atendido_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: até aqui o dashboard era derivado dos registros clínicos. Sem
-- semear o vínculo, todo veterinário perderia a lista no deploy. Inclui
-- registro excluído de propósito: o atendimento aconteceu, e a regra nova é
-- que apagar o registro não tira o pet da lista.
INSERT INTO "pet_atendido" ("id", "veterinario_id", "pet_id", "created_at", "ultimo_acesso_em")
SELECT gen_random_uuid(), "veterinario_id", "pet_id", MIN("created_at"), MAX("created_at")
FROM (
    SELECT "veterinario_id", "pet_id", "created_at" FROM "nota_clinica" WHERE "veterinario_id" IS NOT NULL
    UNION ALL
    SELECT "veterinario_id", "pet_id", "created_at" FROM "vaccine_record" WHERE "veterinario_id" IS NOT NULL
    UNION ALL
    SELECT "veterinario_id", "pet_id", "created_at" FROM "deworming_record" WHERE "veterinario_id" IS NOT NULL
    UNION ALL
    SELECT "veterinario_id", "pet_id", "created_at" FROM "medication_record" WHERE "veterinario_id" IS NOT NULL
) AS "atendimentos"
GROUP BY "veterinario_id", "pet_id";
