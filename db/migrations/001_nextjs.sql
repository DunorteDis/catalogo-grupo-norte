-- Next.js + Postgres próprio: o que o Supabase fazia por fora do schema crm.
-- Aditiva e idempotente: rodar de novo não muda nada.

-- auth.users virou crm.usuarios, mas sem senha e sem defaults.
ALTER TABLE crm.usuarios ADD COLUMN IF NOT EXISTS senha_hash text;
ALTER TABLE crm.usuarios ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE crm.usuarios ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE crm.usuarios ALTER COLUMN updated_at SET DEFAULT now();

-- O GoTrue garantia e-mail único; agora é o índice. É ele que decide
-- "usuário já existe" ao criar acesso, sem corrida entre olhar e inserir.
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_key ON crm.usuarios (lower(email));

-- Substitui o bucket "catalogos" do Storage. Mesma lista de tipos e limite.
CREATE TABLE IF NOT EXISTS crm.imagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  dados bytea NOT NULL CHECK (octet_length(dados) <= 2097152),
  created_at timestamptz NOT NULL DEFAULT now()
);
