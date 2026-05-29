-- CreateTable
CREATE TABLE "veterinario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "crmv" TEXT NOT NULL,
    "telefone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "veterinario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nota_clinica" (
    "id" TEXT NOT NULL,
    "veterinario_id" TEXT NOT NULL,
    "pet_id" TEXT NOT NULL,
    "google_place_id" TEXT,
    "diagnostico" TEXT NOT NULL,
    "prescricao" TEXT,
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nota_clinica_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "veterinario_email_key" ON "veterinario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "veterinario_crmv_key" ON "veterinario"("crmv");

-- CreateIndex
CREATE INDEX "nota_clinica_veterinario_id_idx" ON "nota_clinica"("veterinario_id");

-- CreateIndex
CREATE INDEX "nota_clinica_pet_id_idx" ON "nota_clinica"("pet_id");

-- CreateIndex
CREATE INDEX "nota_clinica_google_place_id_idx" ON "nota_clinica"("google_place_id");

-- AddForeignKey
ALTER TABLE "nota_clinica" ADD CONSTRAINT "nota_clinica_veterinario_id_fkey" FOREIGN KEY ("veterinario_id") REFERENCES "veterinario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_clinica" ADD CONSTRAINT "nota_clinica_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
