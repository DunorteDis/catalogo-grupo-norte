-- Histórico do cliente (Fase 0): últimos pedidos, último preço de cada produto e mix.
-- Sai da mesma tabela de vendas do ERP dos mais vendidos (score.faturamento_por_cliente),
-- que guarda só os últimos ~3 meses e é recriada toda noite sem índice: consulta por
-- cliente na hora leva de segundos a quase um minuto. A conta roda na tarefa noturna que
-- já existe (crm-mais-vendidos, 03:30 em Manaus) e a tela só lê o resultado.
--
-- A tabela do ERP tem duas linhas por produto do pedido: a do pedido (data, situação,
-- vlr_tot_pedido) e a do faturamento (nota, quantidade, vlr_tot_faturado_venda, e a data
-- do faturamento em data_venda). Pedido ainda não faturado só tem a primeira.

-- Um por pedido do cliente.
CREATE TABLE IF NOT EXISTS crm.historico_pedidos (
  codcli integer NOT NULL,
  numped bigint NOT NULL,
  data date,                 -- data do pedido
  faturado_em date,
  posicao text,              -- FATURADO, LIBERADO, PENDENTE, BLOQUEADO, MONTADO
  valor numeric,             -- valor do pedido
  valor_faturado numeric,    -- valor da nota (nulo enquanto não faturou)
  itens integer NOT NULL,    -- produtos diferentes
  nota bigint,
  entrega date,
  situacao_entrega text,
  codusur integer,           -- RCA que vendeu
  PRIMARY KEY (codcli, numped)
);

-- Por cliente e produto, além de em quantos pedidos (o que já tinha): a última compra,
-- o preço que ele pagou nela (valor faturado ÷ quantidade, na unidade de venda) e o total.
ALTER TABLE crm.compras_recentes ADD COLUMN IF NOT EXISTS qtd_total numeric;
ALTER TABLE crm.compras_recentes ADD COLUMN IF NOT EXISTS ultima_compra date;
ALTER TABLE crm.compras_recentes ADD COLUMN IF NOT EXISTS ultimo_preco numeric;
ALTER TABLE crm.compras_recentes ADD COLUMN IF NOT EXISTS ultima_qtd numeric;
ALTER TABLE crm.compras_recentes ADD COLUMN IF NOT EXISTS ultimo_pedido bigint;

-- Mesmo nome (a tarefa noturna chama por ele) e as mesmas permissões: CREATE OR REPLACE
-- mantém dono e GRANTs, mas não o SECURITY DEFINER nem o search_path, que vão de novo.
CREATE OR REPLACE FUNCTION crm.atualizar_mais_vendidos() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, pg_temp AS $$
BEGIN
  TRUNCATE crm.compras_recentes, crm.mais_vendidos, crm.historico_pedidos;

  INSERT INTO crm.historico_pedidos (codcli, numped, data, faturado_em, posicao, valor,
                                     valor_faturado, itens, nota, entrega, situacao_entrega,
                                     codusur)
  SELECT cod_cliente::integer, numero_pedido,
         max(data_pedido)::date, max(data_faturamento_pedido)::date, max(posicao_ped),
         sum(vlr_tot_pedido), sum(vlr_tot_faturado_venda),
         count(DISTINCT cod_produto)::integer, max(numero_nota), max(data_entrega)::date,
         max(situacao_entrega), max(cod_rca)::integer
    FROM score.faturamento_por_cliente
   WHERE cod_cliente IS NOT NULL AND numero_pedido IS NOT NULL
   GROUP BY 1, 2;

  -- Medida em pedidos, não em quantidade (somar caixa com unidade distorce).
  INSERT INTO crm.compras_recentes (codcli, codprod, pedidos, qtd_total, ultima_compra,
                                    ultimo_preco, ultima_qtd, ultimo_pedido)
  SELECT t.codcli, t.codprod, t.pedidos, t.qtd_total, u.data, u.preco, u.qtd, u.numped
    FROM (SELECT cod_cliente::integer AS codcli, cod_produto::integer AS codprod,
                 count(DISTINCT numero_pedido)::integer AS pedidos,
                 sum(qtd_faturado_liq) AS qtd_total
            FROM score.faturamento_por_cliente
           WHERE cod_cliente IS NOT NULL AND cod_produto IS NOT NULL
             AND data_venda >= current_date - interval '3 months'
           GROUP BY 1, 2) t
    LEFT JOIN (SELECT DISTINCT ON (cod_cliente, cod_produto)
                      cod_cliente::integer AS codcli, cod_produto::integer AS codprod,
                      data_venda::date AS data, numero_pedido AS numped,
                      qtd_faturado_liq AS qtd,
                      round(vlr_tot_faturado_venda / qtd_faturado_liq, 4) AS preco
                 FROM score.faturamento_por_cliente
                -- Bonificação (valor zero) não é preço.
                WHERE qtd_faturado_liq > 0 AND vlr_tot_faturado_venda > 0
                ORDER BY cod_cliente, cod_produto, data_venda DESC, numero_pedido DESC) u
      ON u.codcli = t.codcli AND u.codprod = t.codprod;

  INSERT INTO crm.mais_vendidos (codprod, pedidos, clientes)
  SELECT codprod, sum(pedidos)::integer, count(*)::integer
    FROM crm.compras_recentes
   GROUP BY codprod;

  ANALYZE crm.historico_pedidos;
  ANALYZE crm.compras_recentes;
  ANALYZE crm.mais_vendidos;
END $$;

-- As tabelas nascem vazias ou com colunas novas vazias: a primeira conta já sai aqui.
SELECT crm.atualizar_mais_vendidos();
