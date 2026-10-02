-- Se o número do vendedor está conectado à W-API, para avisar na hora quando cair (as
-- mensagens param de chegar ao CRM). null enquanto não se sabe. Atualizado pelos webhooks
-- de conexão/desconexão, pela consulta de estado e por toda mensagem que chega.
ALTER TABLE crm.whatsapp_numeros ADD COLUMN IF NOT EXISTS conectado boolean;
ALTER TABLE crm.whatsapp_numeros ADD COLUMN IF NOT EXISTS conexao_em timestamptz;
