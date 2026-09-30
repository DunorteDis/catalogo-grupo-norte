-- distribuidoras.logo_url passa a guardar o logo enviado na tela Distribuidoras
-- (/imagens/<id>, em crm.imagens). Aplicar com: bun scripts/aplicar-sql.ts <este arquivo>
--
-- As 7 distribuidoras de antes têm o logo no código (src/lib/logos.ts, por slug) e
-- nesta coluna só um caminho do Lovable (/__l5e/...) que não abre mais: sai, para
-- a coluna guardar só logo de verdade.

UPDATE crm.distribuidoras SET logo_url = NULL WHERE logo_url LIKE '/__l5e/%';
