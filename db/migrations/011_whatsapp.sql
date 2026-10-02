-- WhatsApp pela W-API (não oficial): o número de cada vendedor, as conversas e as mensagens.
-- A caixa de entrada lê só crm.conversas (a última mensagem fica copiada nela); o histórico
-- lê crm.mensagens pelo índice (conversa, horário), 50 de cada vez. O corpo do webhook fica
-- em `bruto` (jsonb) para consulta futura. Mídia, quando entrar, vai para o S3.
-- Entra sozinha quando o servidor sobe (src/server/migracoes.ts).

CREATE TABLE IF NOT EXISTS crm.whatsapp_numeros (
  vendedor_id uuid PRIMARY KEY REFERENCES crm.vendedores(id) ON DELETE CASCADE,
  instancia text NOT NULL UNIQUE,   -- instanceId da W-API
  token text NOT NULL,              -- token da instância (Authorization: Bearer)
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id uuid NOT NULL REFERENCES crm.vendedores(id) ON DELETE CASCADE,
  telefone text NOT NULL,           -- DDD + número, como chegou do WhatsApp
  nome_contato text,                -- nome que o contato usa no WhatsApp
  codcli integer,                   -- cliente: achado pelo celular ou escolhido pelo vendedor
  ultima_mensagem text,
  ultima_em timestamptz,
  ultima_de_mim boolean,
  nao_lidas integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendedor_id, telefone)
);
CREATE INDEX IF NOT EXISTS conversas_caixa ON crm.conversas (vendedor_id, ultima_em DESC);

CREATE TABLE IF NOT EXISTS crm.mensagens (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversa_id uuid NOT NULL REFERENCES crm.conversas(id) ON DELETE CASCADE,
  wa_id text NOT NULL,              -- id da mensagem no WhatsApp: webhook repetido não duplica
  de_mim boolean NOT NULL,
  tipo text NOT NULL,               -- texto, imagem, audio, video, documento, figurinha, outro
  texto text,
  enviada_em timestamptz NOT NULL,
  bruto jsonb NOT NULL,
  UNIQUE (conversa_id, wa_id)
);
CREATE INDEX IF NOT EXISTS mensagens_historico ON crm.mensagens (conversa_id, enviada_em DESC, id DESC);

-- DDD + 8 últimos dígitos (chaveTelefone em src/lib/whatsapp.ts): o WhatsApp manda alguns
-- celulares sem o 9 da frente e o cadastro tem com o 9; pela chave os dois batem.
CREATE OR REPLACE FUNCTION crm.chave_telefone(fone text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN length(n) IN (10, 11) THEN left(n, 2) || right(n, 8) END
    FROM (SELECT regexp_replace(regexp_replace(regexp_replace(coalesce(fone, ''), '\D', '', 'g'),
                 '^0+', ''), '^55(?=\d{10,11}$)', '') AS n) t
$$;

-- Pedido do catálogo ligado à conversa pelo código que vai na mensagem ("Pedido #A1B2C3D4").
ALTER TABLE crm.pedidos ADD COLUMN IF NOT EXISTS conversa_id uuid REFERENCES crm.conversas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS pedidos_conversa ON crm.pedidos (conversa_id) WHERE conversa_id IS NOT NULL;
