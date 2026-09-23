-- CreateTable
CREATE TABLE "tag_coleira" (
    "id" TEXT NOT NULL,
    "pet_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "qr_code_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tag_coleira_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tag_coleira_pet_id_key" ON "tag_coleira"("pet_id");

-- CreateIndex
CREATE UNIQUE INDEX "tag_coleira_token_key" ON "tag_coleira"("token");

-- AddForeignKey
ALTER TABLE "tag_coleira" ADD CONSTRAINT "tag_coleira_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
