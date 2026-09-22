-- A base passa a espelhar o export do ERP linha a linha, e nao um produto por
-- EAN. O mesmo codigo aparece mais de uma vez: em empresas diferentes e, em 417
-- casos, dentro da mesma empresa com outra grafia do nome. Decisao do dono do
-- cadastro -- nenhuma linha do ERP fica de fora.

-- 1. Tira a unicidade do codigo. O nome da constraint vem do CREATE TABLE
--    original (produtos_codigo_key), mas procurar pelo catalogo evita depender
--    disso e deixa a migration rodar num banco que ja foi mexido a mao.
DO $$
DECLARE
  nome_constraint text;
BEGIN
  SELECT c.conname INTO nome_constraint
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'produtos'
    AND c.contype = 'u'
    AND c.conkey = ARRAY[
      (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'codigo')
    ];
  IF nome_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.produtos DROP CONSTRAINT %I', nome_constraint);
  END IF;
END $$;

-- 2. O UNIQUE tambem era o indice de busca por codigo (usado pelo "colar
--    codigos" e pela busca do catalogo). Sem ele, seq scan em toda consulta.
CREATE INDEX IF NOT EXISTS produtos_codigo_idx ON public.produtos (codigo);

-- 3. De que empresa do ERP veio a linha. E o unico campo que separa parte das
--    repeticoes -- as outras 417 o proprio ERP nao distingue.
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS cod_empresa integer;
CREATE INDEX IF NOT EXISTS produtos_cod_empresa_idx ON public.produtos (cod_empresa);
