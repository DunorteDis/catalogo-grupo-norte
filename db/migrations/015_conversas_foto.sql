-- Foto de perfil do contato no WhatsApp. O link (pps.whatsapp.net) vence em uns 10 dias e
-- é renovado pela W-API quando vence; foto_em diz quando foi conferido, para não perguntar
-- de novo a cada abertura quando o contato não tem foto.
ALTER TABLE crm.conversas ADD COLUMN IF NOT EXISTS foto_url text;
ALTER TABLE crm.conversas ADD COLUMN IF NOT EXISTS foto_em timestamptz;
