-- AlterTable: add password column with a temporary default for existing rows
ALTER TABLE "tutor" ADD COLUMN "password" TEXT NOT NULL DEFAULT '';

-- Backfill existing rows with a bcrypt placeholder (invalid hash, forces password reset)
UPDATE "tutor" SET "password" = '$2b$10$placeholder.invalid.hash.needs.reset000000000000000000' WHERE "password" = '';

-- Remove the default so new rows must provide a password
ALTER TABLE "tutor" ALTER COLUMN "password" DROP DEFAULT;

-- DropIndex
DROP INDEX IF EXISTS "tutor_auth0_id_key";

-- AlterTable: drop auth0_id column
ALTER TABLE "tutor" DROP COLUMN IF EXISTS "auth0_id";
