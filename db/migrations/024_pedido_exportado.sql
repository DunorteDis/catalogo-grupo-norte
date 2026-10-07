-- Primeira exportação do Excel do pedido: fim do atendimento até existir "Lançar no ERP".
-- O tempo de atendimento (exportado_em - created_at) só aparece no painel do admin.
-- Exportar de novo não sobrescreve: vale a primeira.
ALTER TABLE crm.pedidos ADD COLUMN IF NOT EXISTS exportado_em timestamptz;
ALTER TABLE crm.pedidos ADD COLUMN IF NOT EXISTS exportado_por uuid
  REFERENCES crm.usuarios(id) ON DELETE SET NULL;
