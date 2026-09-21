ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vendedor';

ALTER TABLE public.vendedores ALTER COLUMN distribuidora_id DROP NOT NULL;

ALTER TABLE public.vendedores ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS vendedores_user_id_key ON public.vendedores(user_id) WHERE user_id IS NOT NULL;

CREATE POLICY "vendedor le proprio cadastro"
ON public.vendedores FOR SELECT TO authenticated
USING (user_id = auth.uid());