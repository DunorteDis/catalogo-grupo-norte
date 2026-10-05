-- Itens de cada pedido do histórico do cliente: produto, quantidade e valor. Mesma fonte e
-- mesma tarefa noturna da 022 (a tabela do ERP não tem índice; a tela só lê o resultado).
-- Pedido faturado: quantidade e valor da nota. Ainda não faturado: só o valor do pedido (a
-- linha do pedido não traz quantidade). O mesmo produto pode vir em mais de uma linha no
-- pedido: soma.
CREATE TABLE IF NOT EXISTS crm.historico_itens (
  codcli integer NOT NULL,
  numped bigint NOT NULL,
  codprod integer NOT NULL,
  qtd numeric,
  valor numeric,
  PRIMARY KEY (codcli, numped, codprod)
);

-- A 022 de novo, com os itens. CREATE OR REPLACE mantém dono e GRANTs, mas não o SECURITY
-- DEFINER nem o search_path, que vão de novo.
CREATE OR REPLACE FUNCTION crm.atualizar_mais_vendidos() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, pg_temp AS $$
BEGIN
  TRUNCATE crm.compras_recentes, crm.mais_vendidos, crm.historico_pedidos, crm.historico_itens;

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

  INSERT INTO crm.historico_itens (codcli, numped, codprod, qtd, valor)
  SELECT cod_cliente::integer, numero_pedido, cod_produto::integer,
         sum(qtd_faturado_liq), coalesce(sum(vlr_tot_faturado_venda), sum(vlr_tot_pedido))
    FROM score.faturamento_por_cliente
   WHERE cod_cliente IS NOT NULL AND numero_pedido IS NOT NULL AND cod_produto IS NOT NULL
   GROUP BY 1, 2, 3;

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
  ANALYZE crm.historico_itens;
  ANALYZE crm.compras_recentes;
  ANALYZE crm.mais_vendidos;
END $$;

SELECT crm.atualizar_mais_vendidos();
