-- A descrição do produto pode ser editada no sistema (tela Produtos → Editar) e a
-- edição tem que sobreviver à sincronização diária com a system.pcprodut.
-- Aplicar com: bun scripts/aplicar-sql.ts <este arquivo>
--
-- nome_editado = a descrição foi trocada no sistema: a sincronização para de pôr a
-- do ERP nesse produto. O EAN (codigo) continua vindo sempre do ERP.

ALTER TABLE crm.produtos
  ADD COLUMN IF NOT EXISTS nome_editado boolean NOT NULL DEFAULT false;

-- Igual à 002, só o passo de atualização respeita nome_editado.
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

  INSERT INTO crm.produtos (id, codigo, nome, arquivo, ativo, created_at, updated_at, cod_empresa, cod_produto)
  SELECT DISTINCT ON (x.codprod)
         gen_random_uuid(),
         CASE WHEN coalesce(x.codauxiliar, 0) > 0 THEN trunc(x.codauxiliar)::bigint::text ELSE x.codprod::text END,
         coalesce(nullif(trim(x.descricao), ''), x.codprod::text),
         NULL, true, now(), now(), NULL, x.codprod
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
