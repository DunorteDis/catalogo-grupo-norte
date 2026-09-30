-- crm.produtos segue a system.pcprodut, que é truncada e recarregada todo dia
-- (~02:00 local) a partir do ERP. Aplicar com: bun scripts/aplicar-sql.ts <este arquivo>
--
-- Reconcilia em vez de recarregar: o id do produto é a chave dos catálogos
-- (distribuidora_produtos, ON DELETE CASCADE), então produto nunca é apagado.
-- Chave de vínculo: crm.produtos.cod_produto = system.pcprodut.codprod.
--   - codprod novo no ERP          → cadastra, ativo
--   - codprod que já existe        → nome e codigo (EAN) passam a ser os do ERP
--   - saiu do ERP (ou sem código)  → desativa e marca desativado_pelo_erp
--   - marcado e voltou ao ERP      → reativa
-- O ativo de quem está no ERP é do admin (tela de Produtos): a função não mexe.
-- Foto (arquivo) e vínculos com catálogo não existem no ERP: não são tocados.

-- Distingue "desativado porque saiu do ERP" de "o admin ocultou".
ALTER TABLE crm.produtos
  ADD COLUMN IF NOT EXISTS desativado_pelo_erp boolean NOT NULL DEFAULT false;

-- Uma linha por execução: dá para ver que a rotina roda e o que ela fez.
CREATE TABLE IF NOT EXISTS crm.sincronizacao_produtos (
  id bigserial PRIMARY KEY,
  quando timestamptz NOT NULL DEFAULT now(),
  linhas_pcprodut integer NOT NULL,
  inseridos integer,
  atualizados integer,
  desativados integer,
  reativados integer,
  abortado text -- motivo, quando a trava impede a execução
);

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
  -- Duas execuções ao mesmo tempo (job + chamada manual) não se atropelam.
  PERFORM pg_advisory_xact_lock(hashtext('crm.sincronizar_produtos'));

  -- Trava: pcprodut vazia ou bem menor que na última execução boa = carga que
  -- falhou ou ainda está no meio. Sincronizar agora desativaria o catálogo.
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
     SET nome = e.nome, codigo = e.codigo
    FROM (SELECT DISTINCT ON (codprod) codprod,
                 coalesce(nullif(trim(descricao), ''), codprod::text) AS nome,
                 CASE WHEN coalesce(codauxiliar, 0) > 0 THEN trunc(codauxiliar)::bigint::text ELSE codprod::text END AS codigo
            FROM system.pcprodut ORDER BY codprod) e
   WHERE e.codprod = p.cod_produto
     AND (p.nome IS DISTINCT FROM e.nome OR p.codigo IS DISTINCT FROM e.codigo);
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

-- Todo dia às 03:00 em America/Manaus (UTC-4), depois da carga das ~02:00.
-- O pg_cron deste banco agenda em UTC (cron.timezone não configurado): 07:00 UTC.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sincronizar-produtos-erp';
SELECT cron.schedule('sincronizar-produtos-erp', '0 7 * * *', 'SELECT crm.sincronizar_produtos()');
