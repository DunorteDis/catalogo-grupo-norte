-- Código do vendedor no Winthor (codusur): liga o vendedor do CRM à carteira dele em
-- system.vendedor_interno_carteira. Opcional por enquanto; vazio = sem vínculo.
-- Entra sozinha quando o servidor sobe (src/server/migracoes.ts).

ALTER TABLE crm.vendedores ADD COLUMN IF NOT EXISTS codusur integer CHECK (codusur > 0);
