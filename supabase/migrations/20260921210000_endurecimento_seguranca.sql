-- Endurecimento pré-produção. Cada bloco resolve um achado da auditoria.

-- ---------------------------------------------------------------------------
-- 1) Menor privilégio nos GRANTs.
-- O Supabase dá GRANT ALL em public para anon/authenticated por padrão, então
-- hoje o RLS é a ÚNICA camada: um erro futuro numa policy vira falha explorável
-- na hora. Aqui o anônimo perde tudo que não precisa; o RLS continua por cima.
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.produtos, public.distribuidoras, public.distribuidora_produtos,
              public.vendedores, public.pedidos, public.pedido_itens, public.user_roles
  FROM anon;

-- Catálogo é público: só leitura.
GRANT SELECT ON public.produtos, public.distribuidoras, public.distribuidora_produtos TO anon;
-- Checkout anônimo grava e nunca lê (o insert usa Prefer: return=minimal).
GRANT INSERT ON public.pedidos, public.pedido_itens TO anon;
-- vendedores e user_roles: anon não toca. Ver bloco 2.

-- authenticated mantém DML (o admin escreve por aqui), mas TRUNCATE não passa
-- por RLS — nenhuma policy seguraria.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.produtos, public.distribuidoras,
       public.distribuidora_produtos, public.vendedores, public.pedidos,
       public.pedido_itens, public.user_roles FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2) A lista de vendedores deixa de ser pública.
-- A policy antiga (ativo = true, sem restrição de papel) deixava qualquer
-- anônimo baixar nome + WhatsApp + slug da equipe inteira. O catálogo só precisa
-- de UM vendedor, o do slug que o cliente recebeu — e isso o RLS não sabe
-- expressar. Vira função: devolve um, nunca a lista.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "vendedores ativos publicos" ON public.vendedores;

CREATE OR REPLACE FUNCTION public.vendedor_por_slug(p_slug text)
RETURNS TABLE (id uuid, nome text, whatsapp text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT v.id, v.nome, v.whatsapp
    FROM public.vendedores v
   WHERE v.slug = p_slug AND v.ativo = true
$$;

REVOKE ALL ON FUNCTION public.vendedor_por_slug(text) FROM public;
GRANT EXECUTE ON FUNCTION public.vendedor_por_slug(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Limites no pedido anônimo.
-- O checkout é aberto por design (cliente não tem login), então o que dá para
-- fazer é limitar o tamanho do estrago: campo gigante não entra.
-- ---------------------------------------------------------------------------
ALTER TABLE public.pedidos
  ADD CONSTRAINT pedidos_total_itens_sensato CHECK (total_itens > 0 AND total_itens <= 100000),
  ADD CONSTRAINT pedidos_cliente_nome_tamanho CHECK (cliente_nome IS NULL OR length(cliente_nome) <= 120),
  ADD CONSTRAINT pedidos_observacao_tamanho   CHECK (observacao   IS NULL OR length(observacao)   <= 500);

ALTER TABLE public.pedido_itens
  ADD CONSTRAINT pedido_itens_quantidade_sensata CHECK (quantidade > 0 AND quantidade <= 9999),
  ADD CONSTRAINT pedido_itens_nome_tamanho       CHECK (length(nome)   <= 200),
  ADD CONSTRAINT pedido_itens_codigo_tamanho     CHECK (length(codigo) <= 60);

-- Freio de spam por origem. Guarda o md5 do IP, não o IP: serve para agrupar
-- rajadas e não vira cadastro de endereço de ninguém.
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS origem_hash text;
CREATE INDEX IF NOT EXISTS pedidos_origem_idx ON public.pedidos (origem_hash, created_at DESC);

CREATE OR REPLACE FUNCTION public.pedidos_freia_rajada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cab json; ip text; recentes int;
BEGIN
  BEGIN
    cab := current_setting('request.headers', true)::json;
  EXCEPTION WHEN others THEN
    RETURN NEW;  -- fora do PostgREST (server fn, psql): sem cabeçalho, sem freio
  END;
  ip := split_part(coalesce(nullif(cab->>'cf-connecting-ip', ''),
                            nullif(cab->>'x-forwarded-for', ''), ''), ',', 1);
  IF ip = '' THEN RETURN NEW; END IF;

  NEW.origem_hash := md5(ip);
  SELECT count(*) INTO recentes
    FROM public.pedidos
   WHERE origem_hash = NEW.origem_hash AND created_at > now() - interval '1 minute';
  IF recentes >= 10 THEN
    RAISE EXCEPTION 'Muitos pedidos seguidos. Espere um minuto e tente de novo.'
      USING ERRCODE = '54000';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pedidos_freio ON public.pedidos;
CREATE TRIGGER pedidos_freio BEFORE INSERT ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.pedidos_freia_rajada();

-- ---------------------------------------------------------------------------
-- 4) total_itens passa a ser calculado, não informado.
-- Vinha do navegador e ninguém conferia: dava para inflar o painel inteiro
-- mandando total_itens=999999. Agora os itens reais mandam.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pedidos_recalcula_total()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE alvo uuid := coalesce(NEW.pedido_id, OLD.pedido_id);
BEGIN
  UPDATE public.pedidos p
     SET total_itens = greatest(1, (SELECT coalesce(sum(i.quantidade), 0)
                                      FROM public.pedido_itens i
                                     WHERE i.pedido_id = alvo))
   WHERE p.id = alvo;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS pedido_itens_total ON public.pedido_itens;
CREATE TRIGGER pedido_itens_total AFTER INSERT OR UPDATE OR DELETE ON public.pedido_itens
FOR EACH ROW EXECUTE FUNCTION public.pedidos_recalcula_total();

-- ---------------------------------------------------------------------------
-- 5) Cadastro público: NÃO dá para bloquear daqui.
--
-- Tentei um trigger BEFORE INSERT em auth.users recusando email_confirmed_at
-- nulo, apostando que só o signup público chegaria assim. Testado contra a API:
-- não funciona. O GoTrue insere a linha com o campo nulo nos DOIS caminhos e
-- confirma num UPDATE posterior, então o trigger derrubava também a criação de
-- vendedor pelo admin ("Database error creating new user"). Removido.
--
-- Não há sinal confiável no INSERT que separe um do outro — qualquer coisa que
-- o signup aceita no corpo (user_metadata, por exemplo) o atacante também manda.
--
-- O bloqueio é no painel, e só lá:
--   Authentication -> Sign In / Providers -> Email
--   -> desligar "Allow new users to sign up"
-- Confere depois com:
--   curl "$SUPABASE_URL/auth/v1/settings" -H "apikey: $PUBLISHABLE_KEY"
--   deve responder "disable_signup": true
-- ---------------------------------------------------------------------------
