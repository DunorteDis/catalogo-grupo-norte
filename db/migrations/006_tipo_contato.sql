-- Tipo do contato de cliente (dono, comprador, gerente...): texto livre e opcional,
-- digitado na tela Clientes. Aplicar com: bun scripts/aplicar-sql.ts <este arquivo>

ALTER TABLE crm.cliente_contatos ADD COLUMN IF NOT EXISTS tipo text;
