-- Secoes do catalogo: as abas que o cliente ve no topo da grade (Pizzas,
-- Bebidas, Promocao...). Sao do catalogo, nao do produto -- o mesmo item pode
-- estar em Bebidas num catalogo e sem secao no outro --, entao a secao mora na
-- ligacao que ja existe entre catalogo e produto.
CREATE TABLE IF NOT EXISTS public.catalogo_secoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distribuidora_id uuid NOT NULL REFERENCES public.distribuidoras(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (distribuidora_id, nome)
);
CREATE INDEX IF NOT EXISTS secoes_catalogo_idx ON public.catalogo_secoes (distribuidora_id, ordem);

GRANT SELECT ON public.catalogo_secoes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_secoes TO authenticated;
GRANT ALL ON public.catalogo_secoes TO service_role;
ALTER TABLE public.catalogo_secoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "secoes publicas" ON public.catalogo_secoes FOR SELECT USING (true);
CREATE POLICY "admin gerencia secoes" ON public.catalogo_secoes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- SET NULL, nao CASCADE: apagar a secao nao pode apagar produto do catalogo.
-- Os itens voltam para "sem secao" e seguem aparecendo na aba Todos.
ALTER TABLE public.distribuidora_produtos
  ADD COLUMN IF NOT EXISTS secao_id uuid REFERENCES public.catalogo_secoes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS dp_secao_idx ON public.distribuidora_produtos (secao_id);
