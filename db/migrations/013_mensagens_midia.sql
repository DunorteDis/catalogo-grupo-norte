-- Arquivo das mensagens com mídia (foto, áudio, vídeo, documento, figurinha): baixado da
-- W-API logo depois do webhook (ou na primeira vez que alguém abre) e guardado no S3.
-- midia é a chave dentro de whatsapp/ no bucket; null enquanto não baixou.
ALTER TABLE crm.mensagens ADD COLUMN IF NOT EXISTS midia text;
ALTER TABLE crm.mensagens ADD COLUMN IF NOT EXISTS midia_tipo text;
