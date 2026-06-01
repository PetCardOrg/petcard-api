-- CreateEnum
CREATE TYPE "AppointmentSyncStatus" AS ENUM ('PENDING_CREATE', 'SYNCED', 'PENDING_UPDATE', 'PENDING_DELETE', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('DOSE_REMINDER', 'APPOINTMENT_REMINDER');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "deworming_record" ADD COLUMN     "last_notified_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "medication_record" ADD COLUMN     "last_notified_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tutor" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/Fortaleza';

-- AlterTable
ALTER TABLE "vaccine_record" ADD COLUMN     "last_notified_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "appointment" (
    "id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "pet_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "location" TEXT,
    "google_event_id" TEXT,
    "google_etag" TEXT,
    "sync_status" "AppointmentSyncStatus" NOT NULL DEFAULT 'PENDING_CREATE',
    "sync_error" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "appointment_id" TEXT,
    "kind" "NotificationKind" NOT NULL,
    "reference_type" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "metadata" JSONB,
    "fcm_message_id" TEXT,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "error_code" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "appointment_google_event_id_key" ON "appointment"("google_event_id");

-- CreateIndex
CREATE INDEX "appointment_tutor_id_scheduled_at_idx" ON "appointment"("tutor_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "appointment_sync_status_idx" ON "appointment"("sync_status");

-- CreateIndex
CREATE INDEX "notification_tutor_id_created_at_idx" ON "notification"("tutor_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_reference_type_reference_id_idx" ON "notification"("reference_type", "reference_id");

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "tutor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "tutor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
