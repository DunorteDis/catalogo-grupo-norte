-- Mais vendidos do catálogo, das vendas do ERP (score.faturamento_por_cliente) dos últimos
-- 3 meses. A tabela tem 2,3 milhões de linhas e o ranking geral lê mais de 1 milhão: conta
-- feita uma vez por noite, depois da carga do ERP, e o catálogo só lê o resultado.
-- A medida é em quantos pedidos o produto entrou, não a quantidade: somar caixa com unidade
-- distorce. A tabela tem duas linhas por produto (a do pedido e a do faturamento), daí o
-- count(distinct numero_pedido). Também é a base do padrão de compra da Fase 4.

-- Por cliente e produto: em quantos pedidos dos últimos 3 meses o cliente levou o produto.
CREATE MATERIALIZED VIEW IF NOT EXISTS crm.compras_recentes AS
SELECT cod_cliente::integer AS codcli,
       cod_produto::integer AS codprod,
       count(DISTINCT numero_pedido)::integer AS pedidos
  FROM score.faturamento_por_cliente
 WHERE data_pedido >= current_date - interval '3 months'
   AND cod_cliente IS NOT NULL AND cod_produto IS NOT NULL
 GROUP BY 1, 2;
-- Única: o REFRESH ... CONCURRENTLY exige, e o catálogo continua lendo durante a conta.
CREATE UNIQUE INDEX IF NOT EXISTS compras_recentes_cliente
  ON crm.compras_recentes (codcli, codprod);

-- Geral, por produto: pedidos de todos os clientes nos mesmos 3 meses.
CREATE MATERIALIZED VIEW IF NOT EXISTS crm.mais_vendidos AS
SELECT codprod, sum(pedidos)::integer AS pedidos, count(*)::integer AS clientes
  FROM crm.compras_recentes
 GROUP BY codprod;
CREATE UNIQUE INDEX IF NOT EXISTS mais_vendidos_codprod ON crm.mais_vendidos (codprod);

-- A geral sai da por cliente: atualiza nessa ordem.
CREATE OR REPLACE FUNCTION crm.atualizar_mais_vendidos() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY crm.compras_recentes;
  REFRESH MATERIALIZED VIEW CONCURRENTLY crm.mais_vendidos;
END $$;

-- O pg_cron deste banco agenda em UTC: 07:30 UTC (03:30 em Manaus), depois da carga das
-- vendas (~01:30 UTC) e da sincronização de produtos (07:00 UTC).
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'crm-mais-vendidos';
SELECT cron.schedule('crm-mais-vendidos', '30 7 * * *', 'SELECT crm.atualizar_mais_vendidos()');
