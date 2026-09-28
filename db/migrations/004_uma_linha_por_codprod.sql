-- Tira a herança da system.produtos: agora só existem system.pcprodut (fonte) e
-- crm.produtos (espelho). A system.produtos tinha uma linha por empresa, então o
-- mesmo codprod ficou em várias linhas do crm, e a coluna cod_empresa só servia a ela.
-- Aplicar com: bun scripts/aplicar-sql.ts <este arquivo>
-- (vários comandos numa mensagem só = uma transação: entra tudo ou nada)
--
-- 1. Uma linha por codprod. Em cada código repetido fica a linha com a melhor
--    imagem: foto enviada pelo sistema (/fotos/), depois a foto com o EAN do ERP,
--    depois qualquer foto; empate: mais catálogos, depois a mais antiga.
--    A que fica herda ativo (se alguma estava ativa), foto (se não tinha),
--    descrição editada e os vínculos de catálogo das outras, sem repetir catálogo.
-- 2. Sai a coluna cod_empresa, e a sincronização para de citá-la.

CREATE TEMP TABLE dup ON COMMIT DROP AS
WITH g AS (
  SELECT p.id, p.cod_produto,
         row_number() OVER (PARTITION BY p.cod_produto ORDER BY
           coalesce(p.arquivo LIKE '/fotos/%', false) DESC,
           coalesce(split_part(p.arquivo, '.', 1) = p.codigo, false) DESC,
           (p.arquivo IS NOT NULL) DESC,
           (SELECT count(*) FROM crm.distribuidora_produtos dp WHERE dp.produto_id = p.id) DESC,
           p.created_at, p.id) AS ordem
    FROM crm.produtos p
   WHERE p.cod_produto IN (SELECT cod_produto FROM crm.produtos
                            WHERE cod_produto IS NOT NULL GROUP BY 1 HAVING count(*) > 1)
)
SELECT d.id AS sai, k.id AS fica
  FROM g d JOIN g k ON k.cod_produto = d.cod_produto AND k.ordem = 1
 WHERE d.ordem > 1;

UPDATE crm.produtos k SET ativo = true
  FROM dup JOIN crm.produtos s ON s.id = dup.sai
 WHERE k.id = dup.fica AND s.ativo AND NOT k.ativo;

UPDATE crm.produtos k SET arquivo = f.arquivo
  FROM (SELECT DISTINCT ON (dup.fica) dup.fica, s.arquivo
          FROM dup JOIN crm.produtos s ON s.id = dup.sai
         WHERE s.arquivo IS NOT NULL ORDER BY dup.fica, s.created_at) f
 WHERE k.id = f.fica AND k.arquivo IS NULL;

UPDATE crm.produtos k SET nome = f.nome, nome_editado = true
  FROM (SELECT DISTINCT ON (dup.fica) dup.fica, s.nome
          FROM dup JOIN crm.produtos s ON s.id = dup.sai
         WHERE s.nome_editado ORDER BY dup.fica, s.updated_at DESC) f
 WHERE k.id = f.fica AND NOT k.nome_editado;

-- Um vínculo por catálogo: move só se a linha que fica ainda não está nele.
WITH mover AS (
  SELECT DISTINCT ON (dp.distribuidora_id, dup.fica) dp.id, dup.fica
    FROM crm.distribuidora_produtos dp JOIN dup ON dp.produto_id = dup.sai
   WHERE NOT EXISTS (SELECT 1 FROM crm.distribuidora_produtos x
                      WHERE x.distribuidora_id = dp.distribuidora_id AND x.produto_id = dup.fica)
   ORDER BY dp.distribuidora_id, dup.fica, dp.created_at
)
UPDATE crm.distribuidora_produtos dp SET produto_id = mover.fica
  FROM mover WHERE dp.id = mover.id;

-- O que sobrou vinculado às linhas que saem é repetição no mesmo catálogo: sai junto (CASCADE).
DELETE FROM crm.produtos WHERE id IN (SELECT sai FROM dup);

ALTER TABLE crm.produtos DROP COLUMN cod_empresa;

-- Igual à 003, sem cod_empresa no cadastro de produto novo.
CREATE OR REPLACE FUNCTION crm.sincronizar_produtos() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  n_erp integer;
  n_anterior integer;
  n_ins integer;
  n_upd integer;
  n_des integer;
  n_rea integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('crm.sincronizar_produtos'));

  SELECT count(*) INTO n_erp FROM system.pcprodut;
  SELECT linhas_pcprodut INTO n_anterior
    FROM crm.sincronizacao_produtos WHERE abortado IS NULL ORDER BY quando DESC LIMIT 1;
  IF n_erp = 0 OR n_erp < n_anterior * 0.9 THEN
    INSERT INTO crm.sincronizacao_produtos (linhas_pcprodut, abortado)
    VALUES (n_erp, format('pcprodut com %s linhas; a última execução boa teve %s', n_erp, n_anterior));
    RETURN format('abortado: pcprodut com %s linhas (anterior: %s)', n_erp, n_anterior);
  END IF;

  INSERT INTO crm.produtos (id, codigo, nome, arquivo, ativo, created_at, updated_at, cod_produto)
  SELECT DISTINCT ON (x.codprod)
         gen_random_uuid(),
         CASE WHEN coalesce(x.codauxiliar, 0) > 0 THEN trunc(x.codauxiliar)::bigint::text ELSE x.codprod::text END,
         coalesce(nullif(trim(x.descricao), ''), x.codprod::text),
         NULL, true, now(), now(), x.codprod
    FROM system.pcprodut x
   WHERE NOT EXISTS (SELECT 1 FROM crm.produtos p WHERE p.cod_produto = x.codprod)
   ORDER BY x.codprod;
  GET DIAGNOSTICS n_ins = ROW_COUNT;

  UPDATE crm.produtos p
     SET nome = CASE WHEN p.nome_editado THEN p.nome ELSE e.nome END,
         codigo = e.codigo
    FROM (SELECT DISTINCT ON (codprod) codprod,
                 coalesce(nullif(trim(descricao), ''), codprod::text) AS nome,
                 CASE WHEN coalesce(codauxiliar, 0) > 0 THEN trunc(codauxiliar)::bigint::text ELSE codprod::text END AS codigo
            FROM system.pcprodut ORDER BY codprod) e
   WHERE e.codprod = p.cod_produto
     AND ((NOT p.nome_editado AND p.nome IS DISTINCT FROM e.nome) OR p.codigo IS DISTINCT FROM e.codigo);
  GET DIAGNOSTICS n_upd = ROW_COUNT;

  UPDATE crm.produtos p
     SET ativo = true, desativado_pelo_erp = false
   WHERE p.desativado_pelo_erp
     AND EXISTS (SELECT 1 FROM system.pcprodut x WHERE x.codprod = p.cod_produto);
  GET DIAGNOSTICS n_rea = ROW_COUNT;

  UPDATE crm.produtos p
     SET ativo = false, desativado_pelo_erp = true
   WHERE p.ativo
     AND NOT EXISTS (SELECT 1 FROM system.pcprodut x WHERE x.codprod = p.cod_produto);
  GET DIAGNOSTICS n_des = ROW_COUNT;

  INSERT INTO crm.sincronizacao_produtos (linhas_pcprodut, inseridos, atualizados, desativados, reativados)
  VALUES (n_erp, n_ins, n_upd, n_des, n_rea);
  RETURN format('pcprodut: %s | inseridos: %s | atualizados: %s | desativados: %s | reativados: %s',
                n_erp, n_ins, n_upd, n_des, n_rea);
END
$$;
