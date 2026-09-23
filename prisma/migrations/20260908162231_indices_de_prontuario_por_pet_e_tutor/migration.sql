-- Índices que faltavam nos filtros mais quentes do prontuário.
--
-- `nota_clinica`, `acao_clinica` e `pet_scan` já tinham índice por `pet_id`;
-- as três tabelas de registro clínico, não — só por `veterinario_id`, que não
-- é por onde a carteira, a listagem e o histórico consultam. `pet.tutor_id`
-- é a consulta da home do app.

-- CreateIndex
CREATE INDEX "deworming_record_pet_id_idx" ON "deworming_record"("pet_id");

-- CreateIndex
CREATE INDEX "medication_record_pet_id_idx" ON "medication_record"("pet_id");

-- CreateIndex
CREATE INDEX "pet_tutor_id_idx" ON "pet"("tutor_id");

-- CreateIndex
CREATE INDEX "vaccine_record_pet_id_idx" ON "vaccine_record"("pet_id");
