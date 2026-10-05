-- As tarefas noturnas do CRM nunca rodaram: o pg_cron não consegue conectar como dunorte
-- ("connection failed"), e as tarefas do cron_runner funcionam. Elas passam para ele.
--
-- E a 019 tinha um erro: materialized view guarda a tabela que lê pelo OID. A carga do ERP
-- troca score.faturamento_por_cliente toda noite (renomeia a anterior para __old_... e
-- cria outra); a view ficou lendo a velha e impedia a carga de apagá-la. Vira tabela comum,
-- preenchida pela função, que procura a tabela pelo nome a cada execução.

DROP MATERIALIZED VIEW IF EXISTS crm.mais_vendidos;
DROP MATERIALIZED VIEW IF EXISTS crm.compras_recentes;

-- Por cliente e produto: em quantos pedidos dos últimos 3 meses o cliente levou o produto.
CREATE TABLE IF NOT EXISTS crm.compras_recentes (
  codcli integer NOT NULL,
  codprod integer NOT NULL,
  pedidos integer NOT NULL,
  PRIMARY KEY (codcli, codprod)
);

-- Geral, por produto: pedidos de todos os clientes nos mesmos 3 meses.
CREATE TABLE IF NOT EXISTS crm.mais_vendidos (
  codprod integer PRIMARY KEY,
  pedidos integer NOT NULL,
  clientes integer NOT NULL
);

-- Medida em pedidos, não em quantidade (somar caixa com unidade distorce). A tabela do ERP
-- tem duas linhas por produto (pedido e faturamento), daí o count(distinct numero_pedido).
-- Tudo numa transação: às 03:30 o catálogo espera uns segundos e nunca vê a conta pela
-- metade.
CREATE OR REPLACE FUNCTION crm.atualizar_mais_vendidos() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  TRUNCATE crm.compras_recentes, crm.mais_vendidos;
  INSERT INTO crm.compras_recentes (codcli, codprod, pedidos)
  SELECT cod_cliente::integer, cod_produto::integer, count(DISTINCT numero_pedido)::integer
    FROM score.faturamento_por_cliente
   WHERE data_pedido >= current_date - interval '3 months'
     AND cod_cliente IS NOT NULL AND cod_produto IS NOT NULL
   GROUP BY 1, 2;
  INSERT INTO crm.mais_vendidos (codprod, pedidos, clientes)
  SELECT codprod, sum(pedidos)::integer, count(*)::integer
    FROM crm.compras_recentes
   GROUP BY codprod;
  ANALYZE crm.compras_recentes;
  ANALYZE crm.mais_vendidos;
END $$;

-- As duas rodam com as permissões do dono: a tabela nova do ERP nasce sem GRANT nenhum,
-- então um GRANT ao cron_runner se perderia toda noite. Ele só ganha o direito de chamá-las.
ALTER FUNCTION crm.atualizar_mais_vendidos() SECURITY DEFINER SET search_path = crm, pg_temp;
ALTER FUNCTION crm.sincronizar_produtos() SECURITY DEFINER SET search_path = crm, pg_temp;
REVOKE EXECUTE ON FUNCTION crm.atualizar_mais_vendidos() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION crm.sincronizar_produtos() FROM PUBLIC;
GRANT USAGE ON SCHEMA crm TO cron_runner;
GRANT EXECUTE ON FUNCTION crm.atualizar_mais_vendidos() TO cron_runner;
GRANT EXECUTE ON FUNCTION crm.sincronizar_produtos() TO cron_runner;

SELECT cron.alter_job(jobid, username := 'cron_runner')
  FROM cron.job
 WHERE jobname IN ('sincronizar-produtos-erp', 'crm-mais-vendidos');

-- As tabelas nascem vazias: a primeira conta já sai aqui.
SELECT crm.atualizar_mais_vendidos();
