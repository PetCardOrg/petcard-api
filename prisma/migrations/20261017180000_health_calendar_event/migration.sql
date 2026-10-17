-- CreateTable
CREATE TABLE "health_calendar_event" (
    "id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "entidade" "EntidadeClinica" NOT NULL,
    "registro_id" TEXT NOT NULL,
    "google_event_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "health_calendar_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "health_calendar_event_tutor_id_idx" ON "health_calendar_event"("tutor_id");

-- CreateIndex
CREATE UNIQUE INDEX "health_calendar_event_entidade_registro_id_key" ON "health_calendar_event"("entidade", "registro_id");

-- AddForeignKey
ALTER TABLE "health_calendar_event" ADD CONSTRAINT "health_calendar_event_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "tutor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

