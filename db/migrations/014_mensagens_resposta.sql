-- Resposta citando outra mensagem (o "responder" do WhatsApp): o wa_id da mensagem citada,
-- que o histórico procura na mesma conversa para mostrar o trecho em cima do balão.
ALTER TABLE crm.mensagens ADD COLUMN IF NOT EXISTS responde_a text;
