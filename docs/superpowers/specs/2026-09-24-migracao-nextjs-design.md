# Migração para Next.js + Postgres próprio

Data: 2026-09-24 · Branch: `crm-grupo-norte`

## Objetivo

Tirar o app do TanStack Start + Supabase e colocá-lo em Next.js (App Router), com o
backend no próprio Next falando direto com o Postgres da empresa
(`172.16.0.20:5432/dbprod`, schema `crm`), onde as tabelas e os dados já estão.

Sucesso = mesmas telas, mesmo comportamento, mesmas URLs (os links
`/c/<vendedor>/<distribuidora>` já enviados a clientes continuam valendo), todos os
usuários entram com a senha que já têm, e nada do Supabase fica no código.

## Fora do escopo

- Criar container, serviço ou qualquer infra para o banco: o app só conecta.
- Escolher onde o Next roda: build neutro (`next build` + `next start`).
- Redesenhar telas ou trocar react-query por Server Components.
- Criar um usuário de banco com menor privilégio (recomendado: hoje `dunorte` é
  superusuário do banco inteiro; fica como ação para depois).

## Estado encontrado no banco novo

- Tabelas do `crm`: `catalogo_secoes`, `distribuidora_produtos`, `distribuidoras`,
  `pedido_itens`, `pedidos`, `produtos`, `user_roles`, `usuarios`, `vendedores`.
- Funções: `has_role`, `vendedor_por_slug`, `pedidos_recalcula_total`,
  `set_updated_at`. Triggers: `*_updated` e `pedido_itens_total`.
- `crm.usuarios` (substitui `auth.users`): `id, email, phone, raw_user_meta_data,
  email_confirmed_at, last_sign_in_at, created_at, updated_at`. **Sem senha** e sem
  default em `id`/`created_at`. 10 usuários (2 admin, 8 vendedor).
- O trigger antispam `pedidos_freia_rajada` **não** foi migrado.
- Nenhuma distribuidora usa `imagem_url` (Storage) hoje.
- `produtos.arquivo` é nome de arquivo resolvido por `FOTO_BASE` ou URL externa;
  não depende do Supabase.

## Decisões

| Tema | Decisão |
|---|---|
| Abordagem | Trocar a camada de dados, preservar o JSX das telas |
| Framework | Next.js 16 (App Router) em `src/app/`, telas como client components |
| Acesso a dados | Server Actions + SQL direto com `postgres` (postgres.js) |
| Auth | Própria: `bcryptjs` + cookie JWT HS256 (`jose`) |
| Senhas | Copiar `auth.users.encrypted_password` do Supabase para `crm.usuarios.senha_hash` |
| Upload de imagem | Tabela `crm.imagens` (bytea) servida por `GET /imagens/[id]` |
| Gerenciador/testes | `bun` continua |

## 1. Estrutura e rotas

Saem: `@tanstack/*` (menos `react-query`), `vite`, `nitro`, `@vitejs/plugin-react`,
`@tailwindcss/vite`, `vite-tsconfig-paths`, `@supabase/supabase-js`,
`src/integrations/supabase/`, `src/router.tsx`, `src/start.ts`, `src/server.ts`,
`src/routeTree.gen.ts`, `src/lib/error-capture.ts`, `src/lib/error-page.ts`,
`vite.config.ts`, `supabase/`.

Entram: `next`, `postgres`, `jose`, `bcryptjs`, `@tailwindcss/postcss`.

Reaproveitados como estão: `components/ui`, `components/*`, `hooks/*` (só troca a
fonte de dados), `lib/*`, `styles.css`, `assets/`, `public/`, testes.

| Hoje | Next |
|---|---|
| `routes/index.tsx` (→ `/auth`) | `app/page.tsx` com `redirect("/auth")` |
| `routes/auth.tsx` | `app/auth/page.tsx` |
| `routes/definir-senha.tsx` | `app/definir-senha/page.tsx` |
| `routes/c.$slug.index.tsx` | `app/c/[slug]/page.tsx` |
| `routes/c.$slug.$distribuidora.tsx` | `app/c/[slug]/[distribuidora]/page.tsx` |
| `routes/_authenticated/route.tsx` | `app/(app)/layout.tsx` (server: lê sessão) + `components/app-shell.tsx` (client) |
| `routes/_authenticated/admin.tsx` | `app/(app)/admin/layout.tsx` (não-admin → `/vendedor`) |
| `admin.index/catalogo/distribuidoras/pedidos/produtos/usuarios` | `app/(app)/admin/**/page.tsx` |
| `vendedor.tsx`, `meus-pedidos.tsx` | `app/(app)/vendedor/page.tsx`, `app/(app)/meus-pedidos/page.tsx` |
| `routes/__root.tsx` | `app/layout.tsx` (html, fontes, `Providers` com QueryClient + Toaster), `app/not-found.tsx`, `app/error.tsx` |

Conversão de cada tela: `"use client"`, mesmo JSX; `Link`/`useNavigate` →
`next/link`/`useRouter` de `next/navigation`; `Route.useParams()` → `useParams()`;
`head()` → `export const metadata` (em um `layout.tsx` ou página server quando a
página for client); import de imagem retorna objeto → `src={logo.src}` (`auth`,
`definir-senha`, shell, `lib/logos.ts`).

`src/proxy.ts` (Next 16 renomeou `middleware.ts` para `proxy.ts`): sem cookie
válido em `/admin`, `/vendedor`, `/meus-pedidos` → `/auth`; com `prov=true` →
`/definir-senha`. É conforto de navegação; a trava real está nas actions.

## 2. Dados e autorização

`src/server/db.ts`: instância única de `postgres()` (lê `PGHOST`, `PGPORT`,
`PGDATABASE`, `PGUSER`, `PGPASSWORD`), `connection: { search_path: "crm" }`, guardada
em `globalThis` no dev para o HMR não abrir pool novo.

Server Actions (`"use server"`), por domínio:

- `server/publico.ts`: `vendedorPorSlug`, `catalogosDoVendedor`, `vitrine`
  (distribuidora + seções), `produtosDaVitrine` (busca/paginação), `criarPedido`.
- `server/admin.ts`: produtos (listar/salvar/ativar/excluir), distribuidoras
  (listar/ativar), catálogo (itens, seções, vincular, copiar, colar códigos,
  criar/editar/excluir personalizado, enviar imagem), pedidos, visão geral.
- `server/vendedor.ts`: `meuVendedor`, `meusPedidos`.
- `server/acessos.ts`: porte de `lib/acessos.functions.ts`; `auth.admin.*` vira
  SQL em `crm.usuarios` (insert com `senha_hash`, merge de `raw_user_meta_data`
  com `||`, delete).
- `server/auth.ts`: `entrar`, `sair`, `definirSenha`.

Regras (as mesmas do RLS de hoje), aplicadas na primeira linha de cada action:

- Anônimo: ler catálogo público (distribuidoras, vínculos, seções, produtos —
  com os mesmos filtros que as telas já aplicam), `vendedor_por_slug`, criar
  pedido. Nunca a lista de vendedores.
- Vendedor (`exigirLogin`): só o próprio cadastro e os próprios pedidos/itens
  (`vendedores.user_id = sessão.sub`).
- Admin (`exigirAdmin`): tudo; confere `user_roles` no banco a cada chamada.

Busca: `filtrosBusca` passa a devolver as palavras normalizadas; o SQL monta um
`(nome ILIKE $n OR codigo ILIKE $n)` por palavra, unidos por `AND`, sempre
parametrizado. `.range()` → `LIMIT/OFFSET`; `count: "exact"` → `count(*) over()`.

`criarPedido`: zod com os limites dos CHECKs (`cliente_nome` ≤ 120, `observacao`
≤ 500, `quantidade` 1–9999, `codigo` ≤ 60, `nome` ≤ 200, `unidade` em UN/CX);
insere `pedidos` + `pedido_itens` numa transação; antispam: `origem_hash =
md5(ip)` com IP de `x-forwarded-for`, recusa com a mensagem de hoje se houver 10+
pedidos da mesma origem no último minuto.

Imagem do catálogo: action admin valida tipo (png/jpeg/webp/gif) e tamanho
(≤ 2 MB), grava em `crm.imagens`, devolve `/imagens/<id>`; `app/imagens/[id]/route.ts`
serve com `Content-Type` salvo e `Cache-Control: public, max-age=31536000, immutable`.

Migração SQL (`db/migrations/001_nextjs.sql`, aditiva, idempotente):

```sql
ALTER TABLE crm.usuarios ADD COLUMN IF NOT EXISTS senha_hash text;
ALTER TABLE crm.usuarios ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE crm.usuarios ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE crm.usuarios ALTER COLUMN updated_at SET DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_key ON crm.usuarios (lower(email));
CREATE TABLE IF NOT EXISTS crm.imagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('image/png','image/jpeg','image/webp','image/gif')),
  dados bytea NOT NULL CHECK (octet_length(dados) <= 2097152),
  created_at timestamptz NOT NULL DEFAULT now()
);
```

(O índice único em `lower(email)` substitui a unicidade que o GoTrue garantia; é
ele que decide "usuário já existe" em `criarConta`, sem corrida. Conferido: os 10
e-mails atuais são distintos em minúsculas, o índice cria sem conflito.)

## 3. Login, senhas, erros

`entrar(usuario, senha)`: `loginParaEmail` → `SELECT` em `crm.usuarios` por
`lower(email)` → `bcrypt.compare(senha, senha_hash)` → atualiza
`last_sign_in_at` → cookie `sessao` (JWT HS256, `SESSION_SECRET`, `httpOnly`,
`sameSite=lax`, `secure` em produção, 7 dias) com `sub`, `email`, `admin`, `prov`.
Mensagem única para usuário inexistente e senha errada.

Freio: contador em memória por `usuario+ip`, 5 erros → bloqueio de 15 min
(`ponytail:` vale para uma instância; mover para tabela se escalar).

`definirSenha`: exige sessão, valida `senhaFraca` no servidor, grava
`bcrypt.hash(senha, 10)`, `senha_provisoria=false` no metadata, reemite cookie.

`sair`: apaga o cookie.

`scripts/copiar-senhas.ts` (uma vez): lê `id, encrypted_password` de `auth.users`
via `SUPABASE_DB_URL`, `UPDATE crm.usuarios SET senha_hash = $2 WHERE id = $1`,
imprime quantos casaram e quais ficaram sem. Plano B se não conectar: senha
provisória para todos via `resetarSenha`.

Erros: actions nunca lançam para o client (o Next esconde a mensagem em produção).
Devolvem `{ dados }` ou `{ erro }`; `lib/acao.ts` (client) desembrulha e lança
`Error(erro)`, então `toast.error(mensagemErro(err))` segue igual. Erro inesperado:
`console.error` no servidor + mensagem genérica. `lib/erros.ts` perde as entradas
específicas do Supabase e ganha "Usuário ou senha incorretos.".

## 4. Testes e verificação

- `bun test` dos helpers atuais, com `filtrosBusca` ajustado.
- Checagens novas: compatibilidade `bcryptjs` com hash `$2a$10$` do Supabase;
  freio de login; montagem da busca SQL (parâmetros, não texto).
- `tsc --noEmit`, `eslint`, `next build` passando.
- Fumaça no navegador com `next dev`: login admin, cada tela admin, login
  vendedor, catálogo público. Escritas no dbprod só com autorização e com limpeza
  do que for criado.

## 5. Virada

1. Aplicar `db/migrations/001_nextjs.sql` no dbprod (com ok).
2. Rodar `scripts/copiar-senhas.ts` (com ok e `SUPABASE_DB_URL`).
3. Conferir pedidos criados no Supabase depois da cópia dos dados; copiar os que
   faltarem antes de apontar o domínio.
4. Subir `next start` onde for decidido; atualizar README e `.env` de exemplo.

## Variáveis de ambiente

```
PGHOST=172.16.0.20
PGPORT=5432
PGDATABASE=dbprod
PGUSER=dunorte
PGPASSWORD=...
SESSION_SECRET=...          # 32+ bytes aleatórios
SUPABASE_DB_URL=...         # só para o script de senhas; removível depois
```
