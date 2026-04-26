-- CreateTable
CREATE TABLE "carteira_digital" (
    "id" TEXT NOT NULL,
    "pet_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "qr_code_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carteira_digital_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "carteira_digital_pet_id_key" ON "carteira_digital"("pet_id");

-- CreateIndex
CREATE UNIQUE INDEX "carteira_digital_token_key" ON "carteira_digital"("token");

-- AddForeignKey
ALTER TABLE "carteira_digital" ADD CONSTRAINT "carteira_digital_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
