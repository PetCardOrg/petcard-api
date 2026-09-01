-- CreateEnum
CREATE TYPE "AuthTokenPurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- AlterTable
ALTER TABLE "tutor" ADD COLUMN     "email_verified_at" TIMESTAMP(3),
ADD COLUMN     "google_id" TEXT,
ALTER COLUMN "password" DROP NOT NULL;

-- CreateTable
CREATE TABLE "auth_token" (
    "id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "purpose" "AuthTokenPurpose" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_token_token_hash_key" ON "auth_token"("token_hash");

-- CreateIndex
CREATE INDEX "auth_token_tutor_id_purpose_idx" ON "auth_token"("tutor_id", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_google_id_key" ON "tutor"("google_id");

-- AddForeignKey
ALTER TABLE "auth_token" ADD CONSTRAINT "auth_token_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "tutor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

