# Catálogo Grupo Norte

Catálogo de produtos por distribuidora. O vendedor envia ao cliente um link próprio;
o cliente escolhe os itens e conclui o pedido, que chega pronto no WhatsApp do vendedor.

## Stack

TanStack Start (React 19) · Vite · Tailwind v4 · shadcn/ui · Supabase (Postgres + Auth)

## Desenvolvimento

```sh
bun install
bun run dev      # http://localhost:8080
bun test         # testes dos helpers de acesso
bun run build    # gera .output (preset cloudflare-module)
```

## Variáveis de ambiente

Crie um `.env` na raiz — ele **não** vai para o Git:

```
VITE_SUPABASE_URL=https://<projeto>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<chave publicavel>
SUPABASE_URL=https://<projeto>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<chave publicavel>
SUPABASE_SERVICE_ROLE_KEY=<chave service_role>
```

A `SUPABASE_SERVICE_ROLE_KEY` ignora todo o RLS e é usada só nas server functions
(`src/lib/*.functions.ts`). Nunca a exponha no cliente nem a versione.

## Banco

O schema vive em `supabase/migrations/`. Aplique com o Supabase CLI:

```sh
supabase link --project-ref <ref>
supabase db push
```

Depois, no painel do projeto, confirme: cadastro aberto desativado e tamanho
mínimo de senha em 6.
