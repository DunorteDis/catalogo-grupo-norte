-- Tipo do contato de cliente (dono, comprador, gerente...): opcional, de uma lista fechada
-- (TIPOS_CONTATO em src/lib/catalogo.ts). Aplicar com: bun scripts/aplicar-sql.ts <este arquivo>

ALTER TABLE crm.cliente_contatos ADD COLUMN IF NOT EXISTS tipo text;
