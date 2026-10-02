-- O WhatsApp passou a identificar contatos por um id interno (LID, "123...@lid") além do
-- telefone. A mensagem recebida traz os dois; a enviada pelo celular às vezes só o LID.
-- Guardar o LID na conversa faz as duas caírem no mesmo lugar.
ALTER TABLE crm.conversas ADD COLUMN IF NOT EXISTS lid text;
CREATE INDEX IF NOT EXISTS conversas_lid ON crm.conversas (vendedor_id, lid) WHERE lid IS NOT NULL;
