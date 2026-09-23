-- Passa os e-mails já gravados para a forma canônica (sem espaços nas pontas,
-- tudo em minúsculas), que é como a aplicação passa a gravar e a consultar.
--
-- Duas linhas em caixas diferentes do MESMO endereço colidem com a unique de
-- `email` no meio do UPDATE. Não dá para escolher qual sobrevive: são contas
-- distintas, com pets e histórico próprios, e fundi-las ou renomear uma apaga
-- dado de alguém. Nesse caso a migration para e diz quais endereços resolver
-- na mão — falhar aqui é melhor que subir com contas embaralhadas.
DO $$
DECLARE
  colisoes text;
BEGIN
  SELECT string_agg(email_normalizado, ', ' ORDER BY email_normalizado)
    INTO colisoes
    FROM (
      SELECT lower(btrim(email)) AS email_normalizado
        FROM "tutor"
       GROUP BY lower(btrim(email))
      HAVING count(*) > 1
    ) AS duplicados;

  IF colisoes IS NOT NULL THEN
    RAISE EXCEPTION
      'Contas de tutor colidem ao normalizar o e-mail: %. Resolva as duplicatas antes de migrar.',
      colisoes;
  END IF;

  SELECT string_agg(email_normalizado, ', ' ORDER BY email_normalizado)
    INTO colisoes
    FROM (
      SELECT lower(btrim(email)) AS email_normalizado
        FROM "veterinario"
       GROUP BY lower(btrim(email))
      HAVING count(*) > 1
    ) AS duplicados;

  IF colisoes IS NOT NULL THEN
    RAISE EXCEPTION
      'Contas de veterinário colidem ao normalizar o e-mail: %. Resolva as duplicatas antes de migrar.',
      colisoes;
  END IF;
END
$$;

UPDATE "tutor"
   SET email = lower(btrim(email))
 WHERE email <> lower(btrim(email));

UPDATE "veterinario"
   SET email = lower(btrim(email))
 WHERE email <> lower(btrim(email));
