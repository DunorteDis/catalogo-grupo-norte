-- Catalogo personalizado: uma selecao de produtos que nao pertence a nenhuma
-- distribuidora (campanha, feira, mix da semana). Estruturalmente e a mesma
-- coisa que uma distribuidora -- nome, slug, cor, lista de produtos, link
-- publico e pedido no WhatsApp -- entao mora na mesma tabela, so marcada.
-- Assim o link /c/<vendedor>/<slug>, o carrinho e o registro em pedidos
-- continuam valendo sem nenhuma rota nova.
ALTER TABLE public.distribuidoras
  ADD COLUMN IF NOT EXISTS personalizado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS emoji text;

-- A logo de distribuidora e asset resolvido em build por slug (src/lib/logos.ts),
-- e catalogo personalizado nasce pelo painel, sem deploy. A identidade dele e
-- emoji + cor. Um emoji so: o limite deixa espaco para sequencias ZWJ.
ALTER TABLE public.distribuidoras
  DROP CONSTRAINT IF EXISTS distribuidoras_emoji_curto;
ALTER TABLE public.distribuidoras
  ADD CONSTRAINT distribuidoras_emoji_curto
  CHECK (emoji IS NULL OR char_length(emoji) BETWEEN 1 AND 8);

-- As policies de distribuidoras ja cobrem o resto: leitura publica para o
-- catalogo do cliente e "admin gerencia distribuidoras" (FOR ALL) para criar,
-- editar e apagar. Apagar o catalogo limpa os vinculos pelo ON DELETE CASCADE
-- de distribuidora_produtos.
