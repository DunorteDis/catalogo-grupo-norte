CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created_role
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.distribuidoras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  cor text NOT NULL DEFAULT '#0b2265',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.distribuidoras TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.distribuidoras TO authenticated;
GRANT ALL ON public.distribuidoras TO service_role;
ALTER TABLE public.distribuidoras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "distribuidoras publicas" ON public.distribuidoras FOR SELECT USING (true);
CREATE POLICY "admin gerencia distribuidoras" ON public.distribuidoras FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER distribuidoras_updated BEFORE UPDATE ON public.distribuidoras FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nome text NOT NULL,
  arquivo text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX produtos_nome_idx ON public.produtos USING gin (to_tsvector('portuguese', nome));
GRANT SELECT ON public.produtos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos TO authenticated;
GRANT ALL ON public.produtos TO service_role;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "produtos publicos" ON public.produtos FOR SELECT USING (true);
CREATE POLICY "admin gerencia produtos" ON public.produtos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER produtos_updated BEFORE UPDATE ON public.produtos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.distribuidora_produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distribuidora_id uuid NOT NULL REFERENCES public.distribuidoras(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (distribuidora_id, produto_id)
);
CREATE INDEX dp_distribuidora_idx ON public.distribuidora_produtos (distribuidora_id);
GRANT SELECT ON public.distribuidora_produtos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.distribuidora_produtos TO authenticated;
GRANT ALL ON public.distribuidora_produtos TO service_role;
ALTER TABLE public.distribuidora_produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vinculos publicos" ON public.distribuidora_produtos FOR SELECT USING (true);
CREATE POLICY "admin gerencia vinculos" ON public.distribuidora_produtos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.vendedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  slug text NOT NULL UNIQUE,
  whatsapp text NOT NULL,
  distribuidora_id uuid NOT NULL REFERENCES public.distribuidoras(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vendedores TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendedores TO authenticated;
GRANT ALL ON public.vendedores TO service_role;
ALTER TABLE public.vendedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendedores ativos publicos" ON public.vendedores FOR SELECT USING (ativo = true);
CREATE POLICY "admin gerencia vendedores" ON public.vendedores FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER vendedores_updated BEFORE UPDATE ON public.vendedores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id uuid REFERENCES public.vendedores(id) ON DELETE SET NULL,
  distribuidora_id uuid REFERENCES public.distribuidoras(id) ON DELETE SET NULL,
  cliente_nome text,
  observacao text,
  total_itens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.pedidos TO anon;
GRANT SELECT, INSERT ON public.pedidos TO authenticated;
GRANT ALL ON public.pedidos TO service_role;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qualquer um cria pedido" ON public.pedidos FOR INSERT WITH CHECK (true);
CREATE POLICY "admin le pedidos" ON public.pedidos FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.pedido_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nome text NOT NULL,
  quantidade integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pedido_itens_pedido_idx ON public.pedido_itens (pedido_id);
GRANT INSERT ON public.pedido_itens TO anon;
GRANT SELECT, INSERT ON public.pedido_itens TO authenticated;
GRANT ALL ON public.pedido_itens TO service_role;
ALTER TABLE public.pedido_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qualquer um cria itens" ON public.pedido_itens FOR INSERT WITH CHECK (true);
CREATE POLICY "admin le itens" ON public.pedido_itens FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));