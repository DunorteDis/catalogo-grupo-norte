-- Papel TI: entra em qualquer distribuidora e é o único com a tela Distribuidoras.
-- Aplicar com: bun scripts/aplicar-sql.ts <este arquivo>
--
-- Fica fora da 009: o Postgres não deixa usar um valor novo de enum na mesma
-- transação que o criou. O código de hoje não usa 'ti', então pode rodar antes.

ALTER TYPE crm.app_role ADD VALUE IF NOT EXISTS 'ti';
