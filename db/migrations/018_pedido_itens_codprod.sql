-- Código do produto no Winthor (codprod) no item do pedido, ao lado do `codigo` (o EAN, ou
-- o próprio codprod quando o produto não tem EAN). Fica gravado no item: a sincronização
-- diária troca o EAN do produto quando o ERP muda, e o pedido antigo não pode perder o
-- vínculo. A planilha 9816-2 manda o codprod e só cai no EAN quando ele falta.

ALTER TABLE crm.pedido_itens ADD COLUMN IF NOT EXISTS codprod integer;

-- Produto do item pelo `codigo`. O mesmo EAN pode estar em mais de um produto: vale o que
-- está no catálogo do pedido. Sem produto, fica nulo (nunca barra o pedido).
CREATE OR REPLACE FUNCTION crm.codprod_do_item(item_codigo text, item_pedido uuid) RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT p.cod_produto
    FROM crm.produtos p
   WHERE p.codigo = item_codigo AND p.cod_produto IS NOT NULL
   ORDER BY EXISTS (SELECT 1 FROM crm.distribuidora_produtos dp
                      JOIN crm.pedidos o ON o.catalogo_id = dp.catalogo_id
                     WHERE o.id = item_pedido AND dp.produto_id = p.id) DESC,
            p.cod_produto
   LIMIT 1
$$;

-- No banco, não no app: vale também para o pedido gravado pela versão anterior do sistema.
CREATE OR REPLACE FUNCTION crm.pedido_item_codprod() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.codprod := coalesce(NEW.codprod, crm.codprod_do_item(NEW.codigo, NEW.pedido_id));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pedido_item_codprod ON crm.pedido_itens;
CREATE TRIGGER pedido_item_codprod BEFORE INSERT ON crm.pedido_itens
  FOR EACH ROW EXECUTE FUNCTION crm.pedido_item_codprod();

-- Itens que já existem. O que não acha produto (EAN que mudou ou produto que saiu) fica nulo.
UPDATE crm.pedido_itens SET codprod = crm.codprod_do_item(codigo, pedido_id) WHERE codprod IS NULL;
