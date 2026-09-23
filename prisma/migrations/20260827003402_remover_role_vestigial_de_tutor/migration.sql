-- AlterTable
-- Campo vestigial de um design de usuário unificado anterior à tabela
-- Veterinario separada (PC-083, ver ADR-007). Nunca foi escrito por caminho
-- de código nenhum, exceto pelo seed de demo, que também foi corrigido.
ALTER TABLE "tutor" DROP COLUMN "role";
