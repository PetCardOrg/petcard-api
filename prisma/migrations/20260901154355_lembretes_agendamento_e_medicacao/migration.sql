-- DropForeignKey
ALTER TABLE "notification" DROP CONSTRAINT "notification_appointment_id_fkey";

-- AlterTable
ALTER TABLE "appointment" ADD COLUMN     "last_notified_at" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

