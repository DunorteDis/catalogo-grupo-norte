-- Link do catálogo por cliente: /c/<vendedor>?c=<chave>. A chave diz para quem é o pedido,
-- sem o cliente digitar nada. É sorteada, não o codcli: trocar o número no link não pede
-- em nome de outro. Uma por vendedor e cliente; "Gerar novo link" troca a chave e a antiga
-- para de valer (o link volta a ser o genérico, sem cliente).
CREATE TABLE IF NOT EXISTS crm.links_cliente (
  chave text PRIMARY KEY,
  vendedor_id uuid NOT NULL REFERENCES crm.vendedores(id) ON DELETE CASCADE,
  codcli integer NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendedor_id, codcli)
);

-- Cliente do pedido: pela chave do link ou, sem ela, pelo cliente da conversa em que o
-- código do pedido chegou. Pedido antigo fica vazio.
ALTER TABLE crm.pedidos ADD COLUMN IF NOT EXISTS codcli integer;
