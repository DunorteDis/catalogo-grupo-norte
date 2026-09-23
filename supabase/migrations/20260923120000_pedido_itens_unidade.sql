-- Unidade de medida do item: o cliente escolhe, ao lado da quantidade, se as 12
-- são unidades ou caixas. Sem isso o pedido gravado não diz o que foi pedido.
--
-- O DEFAULT deixa esta migration segura de rodar ANTES do deploy: pedido antigo
-- vira 'UN' (era o único jeito de pedir) e o app ainda sem a coluna segue
-- inserindo normalmente. O CHECK barra lixo vindo do checkout anônimo; unidade
-- nova entra trocando esta lista junto com UNIDADES em src/lib/catalogo.ts.
ALTER TABLE public.pedido_itens
  ADD COLUMN IF NOT EXISTS unidade text NOT NULL DEFAULT 'UN'
  CONSTRAINT pedido_itens_unidade_valida CHECK (unidade IN ('UN', 'CX'));
