-- Celular de quem pediu pelo link geral do catálogo (obrigatório lá), só dígitos com DDD.
-- É por ele que o pedido acha o cliente nos contatos; sem achar, fica para o vendedor
-- identificar, e o número aparece na tela do pedido para ajudar.
ALTER TABLE crm.pedidos ADD COLUMN IF NOT EXISTS telefone text;
ALTER TABLE crm.pedidos DROP CONSTRAINT IF EXISTS pedidos_telefone_formato;
ALTER TABLE crm.pedidos ADD CONSTRAINT pedidos_telefone_formato
  CHECK (telefone IS NULL OR telefone ~ '^[0-9]{10,11}$');
