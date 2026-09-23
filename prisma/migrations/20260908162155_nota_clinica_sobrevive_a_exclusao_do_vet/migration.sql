-- ADR-009: a nota clínica sobrevive à exclusão da conta de quem a escreveu.
--
-- A FK deixa de cascatear e passa a anular. Para a nota continuar atribuída
-- depois disso, nome e CRMV do autor passam a ser gravados na própria linha.
--
-- Escrito à mão: o `ADD COLUMN ... NOT NULL` que o Prisma gera falharia em
-- qualquer base com nota já escrita. Aqui as colunas entram nulas, são
-- preenchidas a partir do veterinário ainda vinculado e só então viram
-- obrigatórias.

-- 1. Colunas da assinatura, ainda nulas.
ALTER TABLE "nota_clinica"
  ADD COLUMN "veterinario_nome" TEXT,
  ADD COLUMN "veterinario_crmv" TEXT;

-- 2. Backfill. Toda nota existente ainda tem FK válida e NOT NULL — é o que a
--    cascata garantia —, então o JOIN cobre a tabela inteira.
UPDATE "nota_clinica" AS n
SET "veterinario_nome" = v."nome",
    "veterinario_crmv" = v."crmv"
FROM "veterinario" AS v
WHERE v."id" = n."veterinario_id";

-- 3. Rede de segurança: nenhuma linha deveria sobrar sem assinatura, mas um
--    NOT NULL que falha no deploy é pior do que uma nota marcada como de
--    autoria não identificada.
UPDATE "nota_clinica"
SET "veterinario_nome" = COALESCE("veterinario_nome", 'Autoria não identificada'),
    "veterinario_crmv" = COALESCE("veterinario_crmv", '—')
WHERE "veterinario_nome" IS NULL OR "veterinario_crmv" IS NULL;

-- 4. Agora sim, obrigatórias.
ALTER TABLE "nota_clinica"
  ALTER COLUMN "veterinario_nome" SET NOT NULL,
  ALTER COLUMN "veterinario_crmv" SET NOT NULL;

-- 5. A FK vira opcional e anulável: excluir o veterinário não leva mais a nota
--    junto — só desfaz o vínculo.
ALTER TABLE "nota_clinica" DROP CONSTRAINT "nota_clinica_veterinario_id_fkey";

ALTER TABLE "nota_clinica" ALTER COLUMN "veterinario_id" DROP NOT NULL;

ALTER TABLE "nota_clinica" ADD CONSTRAINT "nota_clinica_veterinario_id_fkey"
  FOREIGN KEY ("veterinario_id") REFERENCES "veterinario"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
