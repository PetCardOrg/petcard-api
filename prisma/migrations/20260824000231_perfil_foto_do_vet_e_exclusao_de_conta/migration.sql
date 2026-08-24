-- DropForeignKey
ALTER TABLE "pet" DROP CONSTRAINT "pet_tutor_id_fkey";

-- AlterTable
ALTER TABLE "veterinario" ADD COLUMN     "photo_url" TEXT;

-- AddForeignKey
ALTER TABLE "pet" ADD CONSTRAINT "pet_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "tutor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
