# Migração para Next.js + Postgres próprio — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar TanStack Start + Supabase por Next.js 16 com Server Actions falando direto com o Postgres da empresa (schema `crm`), mantendo telas, URLs e senhas.

**Architecture:** App Router em `src/app/`; as telas continuam client components com react-query, e cada `supabase.from(...)` vira uma Server Action em `src/server/*` escrita em SQL (postgres.js, `search_path=crm`). Login próprio: bcrypt + cookie JWT (`jose`); autorização (`exigirLogin`/`exigirAdmin`) na primeira linha de cada action substitui o RLS. Toda action é embrulhada por `acao()` e devolve `{ dados } | { erro }`; o helper `chamar()` no client transforma `erro` em `Error`.

**Tech Stack:** Next.js 16 · React 19 · TypeScript · Tailwind v4 (`@tailwindcss/postcss`) · shadcn/ui · @tanstack/react-query 5 · postgres (postgres.js 3) · jose 6 · bcryptjs 3 · zod 3 · bun (pacotes e testes)

**Spec:** `docs/superpowers/specs/2026-09-24-migracao-nextjs-design.md`

## Global Constraints

- Branch de trabalho: `crm-grupo-norte` (já é o atual). Commit ao fim de cada tarefa.
- Next.js 16 (App Router, `src/app`), React 19, `bun` para instalar e para `bun test`.
- URLs idênticas às de hoje: `/`, `/auth`, `/definir-senha`, `/c/[slug]`, `/c/[slug]/[distribuidora]`, `/admin`, `/admin/catalogo`, `/admin/distribuidoras`, `/admin/pedidos`, `/admin/produtos`, `/admin/usuarios`, `/vendedor`, `/meus-pedidos`.
- Banco: `172.16.0.20:5432/dbprod`, schema `crm`, via `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD`. Nenhum container ou infra. Única mudança de schema: `db/migrations/001_nextjs.sql` (aditiva).
- **Escrita no dbprod** (migração, cópia de senhas, usuários/pedidos/catálogos de teste) **só depois de pedir e receber ok explícito do usuário**, e todo dado de teste é apagado no fim da tarefa que o criou.
- Textos para o usuário em português, mantendo as mensagens atuais. Comentários em português, explicando o porquê; atalho deliberado leva `ponytail:`.
- Toda Server Action exportada é um endpoint público: começa com `exigirLogin()`/`exigirAdmin()`, exceto as do catálogo público (`vendedorPorSlug`, `catalogosPublicos`, `vitrine`, `produtosDaVitrine`, `criarPedido`).
- Toda Server Action é `export const x = acao(async (...) => ...)`; nunca lança para o client. Erro esperado: `throw new Recusa("mensagem")`.
- Helpers que não são endpoints **não** são exportados de arquivos `"use server"`.
- Prettier do projeto: `printWidth 100`, aspas duplas, `trailingComma: all`.
- Gotcha postgres.js: se o TypeScript disser que o `tx` de `sql.begin(async (tx) => ...)` "não é chamável", tipar o parâmetro como `postgres.TransactionSql` (import `type postgres from "postgres"`); não trocar a abordagem.

## Review Focus

1. **SSR de client component que lê `window`/`localStorage` no render** (tema escuro, links do vendedor): no TanStack essas telas tinham `ssr: false`; no Next elas renderizam no servidor. Esperado: nenhuma página quebra nem dá erro de hidratação. → Tarefa 6, passo de fumaça com `next build && next start`.
2. **Busca com caracteres especiais** (`'`, `%`, `_`, `--`, vírgula, parênteses): esperado nenhuma injeção, nenhum erro e nenhum curinga vazando. → Tarefa 2, `db.test.ts`.
3. **Listas vazias em `in`/`any`** (catálogo sem itens, pedido sem código): esperado resultado vazio, não erro de SQL. → Tarefa 2, `db.test.ts`.
4. **Imagem perto de 2 MB passando pela Server Action** (limite padrão do Next é 1 MB): esperado upload aceito até 2 MB e recusa acima. → Tarefa 8, fumaça com PNG de ~1,8 MB.
5. **Cookie `secure` em produção servida por HTTP puro** (IP interno sem HTTPS): esperado login funcionando quando `COOKIE_INSEGURO=1`. → Tarefa 3, teste de `cookieSeguro()`.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `next.config.ts`, `postcss.config.mjs` | Config do Next (limite de corpo das actions) e Tailwind |
| `db/migrations/001_nextjs.sql` | `senha_hash`, defaults de `usuarios`, índice único de e-mail, tabela `imagens` |
| `scripts/aplicar-sql.ts` | Aplica um arquivo `.sql` no banco do `.env` |
| `scripts/copiar-senhas.ts` | Uma vez: hash bcrypt do Supabase → `crm.usuarios.senha_hash` |
| `scripts/usuario-teste.ts` | Cria/apaga `teste.admin` e `teste.vendedor` para a fumaça |
| `src/server/db.ts` | Pool postgres.js + `condicaoBusca()` |
| `src/server/acao.ts` | `acao()` e `Recusa` |
| `src/lib/chamar.ts` | `Resultado<T>` e `chamar()` (client) |
| `src/lib/sessao-token.ts` | Assinar/ler o JWT da sessão (usado no proxy e no servidor) |
| `src/server/sessao.ts` | Cookie, `exigirLogin`, `exigirAdmin`, `ipDaRequisicao` |
| `src/server/freio.ts` | Freio de tentativas de login (memória) |
| `src/server/auth.ts` | Actions `entrar`, `sair`, `definirSenha` |
| `src/server/publico.ts` | Actions do catálogo público e `criarPedido` |
| `src/server/pedidos.ts` | Actions de pedidos, painel e `meuVendedor` |
| `src/server/produtos.ts` | Actions do cadastro de produtos |
| `src/server/catalogos.ts` | Actions de distribuidoras, catálogos, seções, vínculos e imagem |
| `src/server/acessos.ts` | Actions de usuários (porte de `lib/acessos.functions.ts`) |
| `src/proxy.ts` | Redireciona sem sessão / com senha provisória |
| `src/app/**` | Rotas; páginas logadas são client components |
| `src/app/imagens/[id]/route.ts` | Serve a imagem do catálogo |
| `src/components/app-shell.tsx` | Sidebar da área logada (ex-`_authenticated/route.tsx`) |

---

### Task 1: Base Next.js no lugar de TanStack/Vite

**Files:**
- Modify: `package.json`, `tsconfig.json`, `eslint.config.js`, `.gitignore`, `.prettierignore`, `components.json`, `src/lib/logos.ts`
- Create: `next.config.ts`, `postcss.config.mjs`, `src/app/layout.tsx`, `src/app/providers.tsx`, `src/app/page.tsx`, `src/app/not-found.tsx`, `src/app/error.tsx`
- Delete: `vite.config.ts`, `src/router.tsx`, `src/start.ts`, `src/server.ts`, `src/routeTree.gen.ts`, `src/lib/error-capture.ts`, `src/lib/error-page.ts`, `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/README.md`

**Interfaces:**
- Produces: layout raiz com `Providers` (QueryClient `staleTime: 60_000`, `retry: 1` + `Toaster`); `LOGOS` passa a ser `Record<string, string | undefined>` de URLs (`.src`); scripts `dev`, `build`, `start`, `lint`, `test`, `typecheck`.

- [ ] **Step 1: Trocar dependências**

```bash
bun remove @tanstack/react-router @tanstack/react-start @tanstack/router-plugin @tailwindcss/vite vite-tsconfig-paths @vitejs/plugin-react nitro vite
bun add next@^16 postgres jose bcryptjs @tailwindcss/postcss
```

Depois editar `package.json`: `"name": "crm-grupo-norte"`, apagar `"sideEffects": false` (faria o bundler descartar o `import` do CSS global) e o bloco `"overrides"`, e trocar `scripts` por:

```json
"scripts": {
  "dev": "next dev -p 8080",
  "build": "next build",
  "start": "next start -p 8080",
  "lint": "eslint .",
  "format": "prettier --write .",
  "test": "bun test",
  "typecheck": "next typegen && tsc --noEmit"
}
```

- [ ] **Step 2: Config do Next e do Tailwind**

`next.config.ts`:

```ts
import type { NextConfig } from "next";

const config: NextConfig = {
  experimental: {
    // A imagem do catálogo vai até 2 MB e o padrão das Server Actions é 1 MB.
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default config;
```

`postcss.config.mjs`:

```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

- [ ] **Step 3: tsconfig com exclusões de transição**

Substituir `tsconfig.json` inteiro (a lista `exclude` de transição encolhe a cada tarefa e some na Tarefa 10):

```jsonc
{
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next/types/**/*.ts", "scripts/**/*.ts"],
  "exclude": [
    "node_modules",
    // testes rodam com `bun test`, que traz os proprios tipos (bun:test)
    "src/**/*.test.ts",
    // Transição: código ainda em TanStack/Supabase. Sai da lista conforme migra.
    "src/routes",
    "src/integrations",
    "src/lib/acessos.functions.ts",
    "src/hooks/use-catalogos-publicos.ts",
    "src/hooks/use-meu-vendedor.ts",
    "src/hooks/use-vendedor-publico.ts",
    "src/components/lista-pedidos.tsx"
  ],
  "compilerOptions": {
    "target": "ES2022",
    "jsx": "react-jsx",
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "moduleResolution": "Bundler",
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "incremental": true,
    "noEmit": true,
    "plugins": [{ "name": "next" }],

    "skipLibCheck": true,
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noPropertyAccessFromIndexSignature": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

(`noUncheckedSideEffectImports` saiu: o `import "@/styles.css"` do layout é import de efeito colateral sem tipo.)

- [ ] **Step 4: ESLint, ignores e shadcn**

Em `eslint.config.js`: trocar `{ ignores: ["dist", ".output", ".vinxi"] }` por `{ ignores: [".next", "next-env.d.ts", ".vercel", ".tanstack", "dist", ".output"] }`; apagar o bloco `"no-restricted-imports"` inteiro (era regra do TanStack contra `server-only`); trocar a regra do react-refresh por `"react-refresh/only-export-components": ["warn", { allowConstantExport: true, allowExportNames: ["metadata"] }]`.

`.gitignore`: trocar as linhas `.output`, `.vinxi`, `.tanstack/**`, `.nitro` por:

```
.next
next-env.d.ts
.tanstack/**
```

`.prettierignore`: trocar `.output`, `.vinxi` e `routeTree.gen.ts` por `.next` e `next-env.d.ts`.

`components.json`: `"rsc": true` (componente novo do shadcn passa a vir com `"use client"`).

- [ ] **Step 5: Apagar o esqueleto do TanStack**

```bash
git rm vite.config.ts src/router.tsx src/start.ts src/server.ts src/routeTree.gen.ts src/lib/error-capture.ts src/lib/error-page.ts src/routes/__root.tsx src/routes/index.tsx src/routes/README.md
```

- [ ] **Step 6: Layout raiz, providers, 404, erro e `/`**

`src/app/providers.tsx`:

```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: ReactNode }) {
  // No estado, não no módulo: no servidor um cliente de módulo vazaria cache entre requisições.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Tela já aberta volta instantânea; as mutações já invalidam o que editam.
            staleTime: 60_000,
            // Uma tentativa cobre a falha de rede passageira; o resto nunca ia passar mesmo.
            retry: 1,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
```

`src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@/styles.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Catálogo de Pedidos",
  description: "Catálogo de produtos com pedido pelo WhatsApp.",
  openGraph: { type: "website" },
  twitter: { card: "summary_large_image" },
  icons: {
    icon: [
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-64.png", type: "image/png", sizes: "64x64" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

`src/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

// O sistema começa no login. O catálogo público continua em /c/[slug]/[distribuidora].
export default function Inicio() {
  redirect("/auth");
}
```

`src/app/not-found.tsx` — o `NotFoundComponent` do antigo `__root.tsx`, com `Link` do Next:

```tsx
import Link from "next/link";

export default function NaoEncontrada() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Ir para o início
          </Link>
        </div>
      </div>
    </div>
  );
}
```

`src/app/error.tsx` — o `ErrorComponent` antigo; `router.invalidate()` vira `router.refresh()`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Erro({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => console.error(error), [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Esta página não carregou
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo deu errado por aqui. Tente atualizar ou voltar para o início.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.refresh();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir para o início
          </a>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Logos como URL**

No Next, `import x from "*.png"` devolve `{ src, width, height }`. Em `src/lib/logos.ts`, trocar o objeto `LOGOS` por:

```ts
export const LOGOS: Record<string, string | undefined> = {
  dunorte: dunorte.src,
  elonorte: elonorte.src,
  gruponorte: gruponorte.src,
  metanorte: metanorte.src,
  mixnorte: mixnorte.src,
  rotanorte: rotanorte.src,
  supergiro: supergiro.src,
};
```

- [ ] **Step 8: Verificar**

Run: `bun run typecheck` → sai sem erro. (Se `next typegen` não existir na versão instalada, rodar `bun run build` antes do `tsc`, que gera o `next-env.d.ts`.)
Run: `bun test` → 30 pass.
Run: `bun run build` → build ok, rotas `/` e `/_not-found`. Se o Next reescrever o `tsconfig.json` sozinho, manter a edição dele.
Run: `bun run dev` em background e `curl -sI http://localhost:8080/` → `307` com `location: /auth`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: base Next.js 16 no lugar de TanStack Start/Vite"
```

---

### Task 2: Banco, migração e helper de ação

**Files:**
- Create: `db/migrations/001_nextjs.sql`, `scripts/aplicar-sql.ts`, `src/server/db.ts`, `src/server/acao.ts`, `src/lib/chamar.ts`, `src/server/db.test.ts`, `.env.example`
- Modify: `src/lib/catalogo.ts` (`filtrosBusca` → `palavrasBusca`, constantes de página e imagem), `src/lib/catalogo.test.ts`, `src/lib/erros.ts`, `.env` (local, não versionado)

**Interfaces:**
- Produces:
  - `sql` (postgres.js, `search_path=crm`, datas como string ISO) e `condicaoBusca(termo: string)` → fragmento `and (p.nome ilike … or p.codigo ilike …)` por palavra; exige a tabela `produtos` com alias `p`.
  - `acao<A, T>(fn: (...args: A) => Promise<T>): (...args: A) => Promise<Resultado<T>>`, `class Recusa extends Error`.
  - `type Resultado<T> = { dados: T } | { erro: string }`, `chamar<T>(p: Promise<Resultado<T>>): Promise<T>`.
  - Em `lib/catalogo.ts`: `palavrasBusca(texto): string[]`, `PAGINA_VITRINE = 24`, `PAGINA_PRODUTOS = 30`, `PAGINA_CATALOGO = 25`, `TIPOS_IMAGEM`, `MAX_IMAGEM`.

- [ ] **Step 1: Variáveis de ambiente**

Acrescentar ao `.env` local (não versionado):

```
PGHOST=172.16.0.20
PGPORT=5432
PGDATABASE=dbprod
PGUSER=dunorte
PGPASSWORD=DunorT3@2026
SESSION_SECRET=<saída de: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))">
```

Criar `.env.example` (versionado):

```
# Postgres da empresa (schema crm). O postgres.js lê estas variáveis sozinho.
PGHOST=172.16.0.20
PGPORT=5432
PGDATABASE=dbprod
PGUSER=
PGPASSWORD=

# Assina o cookie de sessão. 32+ caracteres aleatórios; trocar derruba todas as sessões.
SESSION_SECRET=

# Só se o app for servido por HTTP puro (sem HTTPS) em produção.
# COOKIE_INSEGURO=1

# Só para scripts/copiar-senhas.ts (Supabase → Project Settings → Database).
# SUPABASE_DB_URL=
```

- [ ] **Step 2: `palavrasBusca` no lugar de `filtrosBusca` — teste primeiro**

Em `src/lib/catalogo.test.ts`, trocar `filtrosBusca` por `palavrasBusca` no import e substituir os quatro testes `filtrosBusca …` por:

```ts
test("palavrasBusca cobra uma palavra de cada vez, em qualquer ordem", () => {
  // Sem isso, "gillette carvao" não acha "AP BARB GILLETTE PRESTO3 CARVAO ATV".
  expect(palavrasBusca("gillette carvao")).toEqual(["gillette", "carvao"]);
});

test("palavrasBusca tira acento, porque o cadastro vem sem", () => {
  expect(palavrasBusca("carvão")).toEqual(["carvao"]);
});

test("palavrasBusca só deixa passar letra e número", () => {
  // % e _ são curinga do ILIKE; aspas e traços não têm o que fazer numa busca.
  expect(palavrasBusca("gillette, carvao (novo)")).toEqual(["gillette", "carvao", "novo"]);
  expect(palavrasBusca("100%*")).toEqual(["100"]);
  expect(palavrasBusca("a_b' or 1=1 --")).toEqual(["a", "b", "or", "1"]);
});

test("palavrasBusca ignora repetição, espaço sobrando e excesso de palavras", () => {
  expect(palavrasBusca("  sabao   sabao ")).toEqual(["sabao"]);
  expect(palavrasBusca("a b c d e f g h")).toHaveLength(6);
  expect(palavrasBusca("")).toEqual([]);
  expect(palavrasBusca("   ")).toEqual([]);
});
```

Run: `bun test src/lib/catalogo.test.ts` → FAIL (`palavrasBusca` não existe).

- [ ] **Step 3: Implementar em `src/lib/catalogo.ts`**

Substituir o JSDoc e o corpo de `filtrosBusca` por:

```ts
/**
 * Palavras da busca, uma condição por palavra no SQL: cada uma precisa aparecer
 * no nome ou no código, em qualquer ordem — é isso que faz "gillette carvao"
 * achar "AP BARB GILLETTE PRESTO3 CARVAO ATV", que o ILIKE do texto inteiro
 * perdia por causa do PRESTO3 no meio.
 *
 * O slugify deixa só [a-z0-9]: nenhum `%` ou `_` chega ao ILIKE como curinga.
 */
export function palavrasBusca(texto: string) {
  const palavras = slugify(texto).split("-").filter(Boolean);
  return [...new Set(palavras)].slice(0, MAX_PALAVRAS_BUSCA);
}
```

E acrescentar ao fim do arquivo:

```ts
/** Tamanho das páginas. Servidor e tela precisam do mesmo número. */
export const PAGINA_VITRINE = 24;
export const PAGINA_PRODUTOS = 30;
export const PAGINA_CATALOGO = 25;

/** Imagem do catálogo personalizado. SVG fica de fora: aberto direto no navegador, roda script. */
export const TIPOS_IMAGEM = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const MAX_IMAGEM = 2 * 1024 * 1024;
```

Run: `bun test src/lib/catalogo.test.ts` → PASS.

- [ ] **Step 4: Migração**

`db/migrations/001_nextjs.sql`:

```sql
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
```

`scripts/aplicar-sql.ts`:

```ts
// Aplica um arquivo .sql no banco do .env. Roda com: bun scripts/aplicar-sql.ts <arquivo>
import postgres from "postgres";

const arquivo = process.argv[2];
if (!arquivo) throw new Error("Uso: bun scripts/aplicar-sql.ts <arquivo.sql>");

const sql = postgres({ max: 1 });
try {
  await sql.unsafe(await Bun.file(arquivo).text());
  console.log(`Aplicado: ${arquivo}`);
} finally {
  await sql.end();
}
```

(Se o `tsc` reclamar de `Bun`, trocar por `(await import("node:fs/promises")).readFile(arquivo, "utf8")`.)

- [ ] **Step 5: PEDIR OK e aplicar no dbprod**

Perguntar ao usuário: "Posso aplicar `db/migrations/001_nextjs.sql` no dbprod? Só acrescenta coluna, defaults, um índice e uma tabela." Só com o ok:

Run: `bun scripts/aplicar-sql.ts db/migrations/001_nextjs.sql` → `Aplicado: db/migrations/001_nextjs.sql`.

- [ ] **Step 6: Pool e busca — teste de integração primeiro**

`src/server/db.test.ts`:

```ts
// Integração, só leitura, contra o banco do .env. Sem PGHOST, pula.
import { afterAll, describe, expect, test } from "bun:test";

import { condicaoBusca, sql } from "./db";

describe.skipIf(!process.env["PGHOST"])("banco", () => {
  afterAll(() => sql.end());

  test("data chega como texto ISO, como o Supabase entregava", async () => {
    const [linha] = await sql<{ agora: string }[]>`select now() as agora`;
    expect(typeof linha!.agora).toBe("string");
    expect(linha!.agora).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test("busca acha pelas palavras em qualquer ordem", async () => {
    const [alvo] = await sql<{ id: string; nome: string }[]>`
      select id, nome from produtos where nome ~ '^[A-Z0-9]+ [A-Z0-9]+' limit 1`;
    const [a, b] = alvo!.nome.split(" ");
    const achados = await sql<{ id: string }[]>`
      select p.id from produtos p where true ${condicaoBusca(`${b} ${a}`)}`;
    expect(achados.map((x) => x.id)).toContain(alvo!.id);
  });

  test("busca com aspas, curinga e comentário não injeta nem quebra", async () => {
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from produtos p where true ${condicaoBusca("x' or 1=1 -- %_")}`;
    const [{ total }] = await sql<{ total: number }[]>`select count(*)::int as total from produtos`;
    expect(n).toBeLessThan(total);
  });

  test("busca vazia não filtra", async () => {
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from produtos p where true ${condicaoBusca("")}`;
    const [{ total }] = await sql<{ total: number }[]>`select count(*)::int as total from produtos`;
    expect(n).toBe(total);
  });

  test("lista vazia em any() devolve nada, sem erro de SQL", async () => {
    const linhas = await sql`select id from produtos where id = any(${sql.array([])}::uuid[])`;
    expect(linhas).toHaveLength(0);
  });

  test("migração 001 aplicada", async () => {
    await sql`select senha_hash from usuarios limit 0`;
    await sql`select id, tipo, dados from imagens limit 0`;
  });
});
```

Run: `bun test src/server/db.test.ts` → FAIL (`./db` não existe).

- [ ] **Step 7: `src/server/db.ts`**

```ts
import postgres from "postgres";

import { palavrasBusca } from "@/lib/catalogo";

// ponytail: sem string de conexão — o postgres.js lê PGHOST, PGPORT, PGDATABASE,
// PGUSER e PGPASSWORD, e a senha com "@" não precisa ser escapada numa URL.
function conectar() {
  return postgres({
    connection: { search_path: "crm" },
    // As telas tratam data como texto ISO, que era o que o Supabase devolvia.
    transform: { value: (valor: unknown) => (valor instanceof Date ? valor.toISOString() : valor) },
    onnotice: () => {},
  });
}

const global = globalThis as unknown as { sql?: ReturnType<typeof conectar> };
// No dev o HMR reavalia o módulo; sem isso cada edição abriria um pool novo.
export const sql = global.sql ?? conectar();
if (process.env.NODE_ENV !== "production") global.sql = sql;

/**
 * Uma condição por palavra digitada, somadas com AND. Espera `produtos` com o
 * alias `p` na consulta. Sempre parametrizado: a palavra nunca vira texto de SQL.
 */
export function condicaoBusca(termo: string) {
  return palavrasBusca(termo).reduce(
    (acc, palavra) => sql`${acc} and (p.nome ilike ${`%${palavra}%`} or p.codigo ilike ${`%${palavra}%`})`,
    sql``,
  );
}
```

Run: `bun test src/server/db.test.ts` → 6 pass.

- [ ] **Step 8: `acao` e `chamar`**

`src/lib/chamar.ts`:

```ts
/** O que toda Server Action devolve: em produção o Next esconde a mensagem de erro lançado. */
export type Resultado<T> = { dados: T } | { erro: string };

/** Desembrulha no client: `erro` vira Error, e o `toast.error(mensagemErro(e))` das telas segue igual. */
export async function chamar<T>(pendente: Promise<Resultado<T>>): Promise<T> {
  const r = await pendente;
  if ("erro" in r) throw new Error(r.erro);
  return r.dados;
}
```

`src/server/acao.ts`:

```ts
import { ZodError } from "zod";

import type { Resultado } from "@/lib/chamar";
import { mensagemErro } from "@/lib/erros";

/** Erro esperado (validação, permissão): a mensagem vai para a tela como está. */
export class Recusa extends Error {}

/**
 * Embrulha uma Server Action. Erro lançado dentro dela chegaria ao client como
 * texto genérico em produção, então volta como valor. Erro que não é Recusa é
 * bug ou banco fora do ar: vai para o log do servidor.
 */
export function acao<A extends unknown[], T>(fn: (...args: A) => Promise<T>) {
  return async (...args: A): Promise<Resultado<T>> => {
    try {
      return { dados: await fn(...args) };
    } catch (e) {
      if (e instanceof Recusa) return { erro: e.message };
      if (e instanceof ZodError) return { erro: e.issues[0]?.message ?? "Dados inválidos." };
      console.error(e);
      return { erro: mensagemErro(e) };
    }
  };
}
```

- [ ] **Step 9: `erros.ts` sem Supabase**

Em `src/lib/erros.ts`, apagar do `MAPA` as entradas `invalid login credentials`, `email not confirmed`, `user already registered|already been registered`, `unable to validate email|invalid email`, `signups not allowed|signup is disabled` e `missing supabase environment variable` (com o comentário acima dela). As demais ficam: mapeiam mensagens do Postgres (`duplicate key`, `violates foreign key`, `null value in column`) e de rede.

- [ ] **Step 10: Verificar e commitar**

Run: `bun test` → tudo passa (30 antigos com os 4 reescritos + 6 do banco).
Run: `bun run typecheck` → sem erro.

```bash
git add -A
git commit -m "feat: conexao Postgres (crm), migracao 001 e helper de Server Action"
```

---

### Task 3: Sessão, login e definir senha

**Files:**
- Create: `src/lib/sessao-token.ts`, `src/lib/sessao-token.test.ts`, `src/server/freio.ts`, `src/server/freio.test.ts`, `src/server/bcrypt.test.ts`, `src/server/sessao.ts`, `src/server/auth.ts`, `src/proxy.ts`, `src/app/auth/page.tsx`, `src/app/auth/form-login.tsx`, `src/app/definir-senha/page.tsx`, `src/app/definir-senha/form-senha.tsx`
- Delete: `src/routes/auth.tsx`, `src/routes/definir-senha.tsx` (o JSX vai para os `form-*.tsx`)

**Interfaces:**
- Consumes: `sql`, `acao`, `Recusa`, `chamar` (Tarefa 2).
- Produces:
  - `type Sessao = { sub: string; email: string; admin: boolean; prov: boolean }`; `COOKIE_SESSAO`, `DURACAO_SESSAO_S`, `assinarSessao(s, segredo?)`, `lerToken(token, segredo?) → Sessao | null`, `cookieSeguro(env?) → boolean`.
  - `lerSessao()`, `gravarSessao(s)`, `apagarSessao()`, `exigirLogin() → Sessao`, `exigirAdmin() → Sessao`, `ipDaRequisicao() → string`.
  - Actions `entrar(usuario, senha) → string` (destino), `sair() → void`, `definirSenha(senha) → string` (destino).

- [ ] **Step 1: Testes do token (falham)**

`src/lib/sessao-token.test.ts`:

```ts
// Roda com: bun test
import { expect, test } from "bun:test";
import { SignJWT } from "jose";

import { assinarSessao, cookieSeguro, lerToken } from "./sessao-token";

const SEGREDO = "x".repeat(40);
const SESSAO = { sub: "b3d7c1f0-0000-4000-8000-000000000001", email: "a@b", admin: true, prov: false };

test("assina e lê de volta a mesma sessão", async () => {
  expect(await lerToken(await assinarSessao(SESSAO, SEGREDO), SEGREDO)).toEqual(SESSAO);
});

test("token adulterado, de outro segredo ou ausente não vale", async () => {
  const token = await assinarSessao(SESSAO, SEGREDO);
  expect(await lerToken(token.slice(0, -2) + "xx", SEGREDO)).toBeNull();
  expect(await lerToken(token, "y".repeat(40))).toBeNull();
  expect(await lerToken(undefined, SEGREDO)).toBeNull();
});

test("token vencido não vale", async () => {
  const vencido = await new SignJWT({ email: "a@b", admin: true, prov: false })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(SESSAO.sub)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
    .sign(new TextEncoder().encode(SEGREDO));
  expect(await lerToken(vencido, SEGREDO)).toBeNull();
});

test("segredo curto é erro de configuração, não sessão inválida", async () => {
  await expect(assinarSessao(SESSAO, "curto")).rejects.toThrow("SESSION_SECRET");
  await expect(lerToken("qualquer", "curto")).rejects.toThrow("SESSION_SECRET");
});

test("cookie só é secure em produção, e dá para desligar para HTTP puro", () => {
  expect(cookieSeguro({ NODE_ENV: "production" })).toBe(true);
  expect(cookieSeguro({ NODE_ENV: "production", COOKIE_INSEGURO: "1" })).toBe(false);
  expect(cookieSeguro({ NODE_ENV: "development" })).toBe(false);
});
```

Run: `bun test src/lib/sessao-token.test.ts` → FAIL.

- [ ] **Step 2: `src/lib/sessao-token.ts`**

```ts
import { SignJWT, jwtVerify } from "jose";

// Sem next/headers aqui: o proxy também lê o token.

export const COOKIE_SESSAO = "sessao";
export const DURACAO_SESSAO_S = 60 * 60 * 24 * 7;

export type Sessao = { sub: string; email: string; admin: boolean; prov: boolean };

function chave(segredo = process.env["SESSION_SECRET"]) {
  if (!segredo || segredo.length < 32)
    throw new Error("SESSION_SECRET ausente ou curta (mínimo 32 caracteres).");
  return new TextEncoder().encode(segredo);
}

export async function assinarSessao(s: Sessao, segredo?: string) {
  return new SignJWT({ email: s.email, admin: s.admin, prov: s.prov })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.sub)
    .setIssuedAt()
    .setExpirationTime(`${DURACAO_SESSAO_S}s`)
    .sign(chave(segredo));
}

/** null para token ausente, adulterado ou vencido. Segredo mal configurado lança. */
export async function lerToken(token: string | undefined, segredo?: string): Promise<Sessao | null> {
  const k = chave(segredo);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, k, { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    return {
      sub: payload.sub,
      email: String(payload["email"] ?? ""),
      admin: payload["admin"] === true,
      prov: payload["prov"] === true,
    };
  } catch {
    return null;
  }
}

/**
 * Cookie secure em produção. Servido por HTTP puro (IP interno, sem HTTPS), o
 * navegador descarta cookie secure e o login falha calado: COOKIE_INSEGURO=1.
 */
export function cookieSeguro(env: Record<string, string | undefined> = process.env) {
  return env["NODE_ENV"] === "production" && env["COOKIE_INSEGURO"] !== "1";
}
```

Run: `bun test src/lib/sessao-token.test.ts` → PASS.

- [ ] **Step 3: Freio de login — teste e implementação**

`src/server/freio.test.ts`:

```ts
// Roda com: bun test
import { expect, test } from "bun:test";

import { limparErrosLogin, loginBloqueado, registrarErroLogin } from "./freio";

const T0 = 1_000_000;
const MIN = 60_000;

test("bloqueia no quinto erro, não antes", () => {
  for (let i = 0; i < 4; i++) registrarErroLogin("a", T0);
  expect(loginBloqueado("a", T0)).toBe(false);
  registrarErroLogin("a", T0);
  expect(loginBloqueado("a", T0)).toBe(true);
});

test("uma chave não bloqueia outra", () => {
  for (let i = 0; i < 5; i++) registrarErroLogin("b", T0);
  expect(loginBloqueado("c", T0)).toBe(false);
});

test("libera depois de 15 minutos", () => {
  for (let i = 0; i < 5; i++) registrarErroLogin("d", T0);
  expect(loginBloqueado("d", T0 + 14 * MIN)).toBe(true);
  expect(loginBloqueado("d", T0 + 16 * MIN)).toBe(false);
});

test("login certo zera a contagem", () => {
  for (let i = 0; i < 4; i++) registrarErroLogin("e", T0);
  limparErrosLogin("e");
  registrarErroLogin("e", T0);
  expect(loginBloqueado("e", T0)).toBe(false);
});
```

Run: `bun test src/server/freio.test.ts` → FAIL.

`src/server/freio.ts`:

```ts
// Freio contra força bruta no login: o Supabase fazia isso por nós.
// ponytail: contador em memória — vale para UMA instância do Next. Com mais de
// uma atrás de balanceador, mover para uma tabela no crm.
const MAX_ERROS = 5;
const JANELA_MS = 15 * 60 * 1000;

const registros = new Map<string, { erros: number; desde: number }>();

export function loginBloqueado(chave: string, agora = Date.now()) {
  const r = registros.get(chave);
  if (!r) return false;
  if (agora - r.desde > JANELA_MS) {
    registros.delete(chave);
    return false;
  }
  return r.erros >= MAX_ERROS;
}

export function registrarErroLogin(chave: string, agora = Date.now()) {
  const r = registros.get(chave);
  if (!r || agora - r.desde > JANELA_MS) registros.set(chave, { erros: 1, desde: agora });
  else r.erros++;
  // Rajada de chaves diferentes não pode crescer o mapa para sempre.
  if (registros.size > 10_000)
    for (const [k, v] of registros) if (agora - v.desde > JANELA_MS) registros.delete(k);
}

export function limparErrosLogin(chave: string) {
  registros.delete(chave);
}
```

Run: `bun test src/server/freio.test.ts` → PASS.

- [ ] **Step 4: Compatibilidade com o hash do Supabase**

`src/server/bcrypt.test.ts`:

```ts
// Roda com: bun test
import { expect, test } from "bun:test";
import bcrypt from "bcryptjs";

// Formato de auth.users.encrypted_password no Supabase: bcrypt $2a$, custo 10.
const HASH_SUPABASE = "$2a$10$69ZGLyCWJgNn5b4KvRZPpOb/YFjnBTW0pFh9BqcUw9qh4qxJQ/DYa";

test("bcryptjs confere o hash $2a$ copiado do Supabase", async () => {
  expect(await bcrypt.compare("senha-do-supabase", HASH_SUPABASE)).toBe(true);
  expect(await bcrypt.compare("outra-senha", HASH_SUPABASE)).toBe(false);
});
```

Run: `bun test src/server/bcrypt.test.ts` → PASS.

- [ ] **Step 5: `src/server/sessao.ts`**

```ts
import { cookies, headers } from "next/headers";

import {
  COOKIE_SESSAO,
  DURACAO_SESSAO_S,
  assinarSessao,
  cookieSeguro,
  lerToken,
  type Sessao,
} from "@/lib/sessao-token";
import { Recusa } from "@/server/acao";
import { sql } from "@/server/db";

export async function lerSessao() {
  return lerToken((await cookies()).get(COOKIE_SESSAO)?.value);
}

export async function gravarSessao(s: Sessao) {
  (await cookies()).set(COOKIE_SESSAO, await assinarSessao(s), {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSeguro(),
    path: "/",
    maxAge: DURACAO_SESSAO_S,
  });
}

export async function apagarSessao() {
  (await cookies()).delete(COOKIE_SESSAO);
}

export async function exigirLogin() {
  const s = await lerSessao();
  if (!s) throw new Recusa("Sua sessão expirou. Entre novamente.");
  // Senha provisória trafegou por WhatsApp: nada além da troca de senha.
  if (s.prov) throw new Recusa("Defina sua senha antes de continuar.");
  return s;
}

/** Confere no banco a cada chamada: admin rebaixado perde o acesso na hora, como no RLS. */
export async function exigirAdmin() {
  const s = await exigirLogin();
  const [papel] = await sql`
    select 1 from user_roles where user_id = ${s.sub} and role = 'admin'`;
  if (!papel) throw new Recusa("Apenas administradores podem fazer isso.");
  return s;
}

/** IP do cliente atrás do proxy reverso. Vazio quando não há cabeçalho (dev local). */
export async function ipDaRequisicao() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || (h.get("x-real-ip") ?? "");
}
```

- [ ] **Step 6: `src/server/auth.ts`**

```ts
"use server";

import bcrypt from "bcryptjs";

import {
  CHAVE_SENHA_PROVISORIA,
  loginParaEmail,
  senhaEhProvisoria,
  senhaFraca,
  usuarioDeEmail,
} from "@/lib/acessos";
import { acao, Recusa } from "@/server/acao";
import { sql } from "@/server/db";
import { limparErrosLogin, loginBloqueado, registrarErroLogin } from "@/server/freio";
import { apagarSessao, gravarSessao, ipDaRequisicao, lerSessao } from "@/server/sessao";

// Usuário inexistente também paga um bcrypt: o tempo de resposta não pode
// entregar quais usuários existem.
const HASH_FALSO = "$2a$10$69ZGLyCWJgNn5b4KvRZPpOb/YFjnBTW0pFh9BqcUw9qh4qxJQ/DYa";

type Conta = {
  id: string;
  email: string;
  senha_hash: string | null;
  meta: Record<string, unknown> | null;
  admin: boolean;
};

function areaDe(s: { admin: boolean; prov: boolean }) {
  return s.prov ? "/definir-senha" : s.admin ? "/admin" : "/vendedor";
}

export const entrar = acao(async (usuario: string, senha: string) => {
  const email = loginParaEmail(String(usuario ?? ""));
  const chave = `${email}|${await ipDaRequisicao()}`;
  if (loginBloqueado(chave))
    throw new Recusa("Muitas tentativas erradas. Espere 15 minutos e tente de novo.");

  const [conta] = await sql<Conta[]>`
    select u.id, u.email, u.senha_hash, u.raw_user_meta_data as meta,
           exists (select 1 from user_roles r where r.user_id = u.id and r.role = 'admin') as admin
      from usuarios u
     where lower(u.email) = ${email}`;
  const confere = await bcrypt.compare(String(senha ?? ""), conta?.senha_hash ?? HASH_FALSO);
  if (!conta?.senha_hash || !confere) {
    registrarErroLogin(chave);
    throw new Recusa("Usuário ou senha incorretos.");
  }

  limparErrosLogin(chave);
  await sql`update usuarios set last_sign_in_at = now() where id = ${conta.id}`;
  const sessao = {
    sub: conta.id,
    email: conta.email,
    admin: conta.admin,
    prov: senhaEhProvisoria(conta.meta),
  };
  await gravarSessao(sessao);
  return areaDe(sessao);
});

export const sair = acao(async () => {
  await apagarSessao();
});

export const definirSenha = acao(async (senha: string) => {
  // lerSessao, não exigirLogin: quem chega aqui é justamente quem tem senha provisória.
  const s = await lerSessao();
  if (!s) throw new Recusa("Sua sessão expirou. Entre novamente.");
  const nova = String(senha ?? "");
  // A tela já recusa; aqui é a trava de verdade.
  const problema = senhaFraca(nova, usuarioDeEmail(s.email));
  if (problema) throw new Recusa(problema);

  await sql`
    update usuarios
       set senha_hash = ${await bcrypt.hash(nova, 10)},
           raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                                || ${JSON.stringify({ [CHAVE_SENHA_PROVISORIA]: false })}::jsonb,
           updated_at = now()
     where id = ${s.sub}`;
  const sessao = { ...s, prov: false };
  await gravarSessao(sessao);
  return areaDe(sessao);
});
```

- [ ] **Step 7: `src/proxy.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";

import { COOKIE_SESSAO, lerToken } from "@/lib/sessao-token";

// Conforto de navegação, inclusive quando a sessão vence com a tela aberta.
// A trava de verdade é o exigirLogin/exigirAdmin de cada action.
export async function proxy(request: NextRequest) {
  const sessao = await lerToken(request.cookies.get(COOKIE_SESSAO)?.value);
  if (!sessao) return NextResponse.redirect(new URL("/auth", request.url));
  if (sessao.prov && request.nextUrl.pathname !== "/definir-senha")
    return NextResponse.redirect(new URL("/definir-senha", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/vendedor/:path*", "/meus-pedidos/:path*", "/definir-senha"],
};
```

- [ ] **Step 8: Página de login**

`src/app/auth/page.tsx`:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { lerSessao } from "@/server/sessao";
import { FormLogin } from "./form-login";

export const metadata: Metadata = {
  title: "Entrar — Grupo Norte Distribuição",
  description: "Acesso à plataforma de catálogo do Grupo Norte.",
  openGraph: {
    title: "Entrar — Grupo Norte Distribuição",
    description: "Acesso à plataforma de catálogo do Grupo Norte.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: false },
};

export default async function AuthPage() {
  // Quem já tem sessão vai direto para a própria área.
  const s = await lerSessao();
  if (s) redirect(s.prov ? "/definir-senha" : s.admin ? "/admin" : "/vendedor");
  return <FormLogin />;
}
```

`src/app/auth/form-login.tsx`: `git mv src/routes/auth.tsx src/app/auth/form-login.tsx` e editar:
1. Primeira linha: `"use client";`.
2. Imports: apagar `createFileRoute, useNavigate` (`@tanstack/react-router`), `useEffect` e `supabase`; `import { useState } from "react";`; acrescentar `import { useRouter } from "next/navigation";`, `import { chamar } from "@/lib/chamar";`, `import { entrar } from "@/server/auth";`; apagar `import { loginParaEmail } from "@/lib/acessos";`.
3. Apagar o bloco `export const Route = createFileRoute("/auth")({ ... });` (a metadata foi para o `page.tsx`).
4. `function AuthPage()` → `export function FormLogin()`; `const navigate = useNavigate();` → `const router = useRouter();`.
5. Apagar `irParaArea` e o `useEffect` inteiro.
6. Corpo do `try` de `enviar` passa a ser:

```tsx
      const destino = await chamar(entrar(usuario, senha));
      router.replace(destino);
```

7. `src={logoBranco}` → `src={logoBranco.src}` e `src={logoEscuro}` → `src={logoEscuro.src}`.

- [ ] **Step 9: Página de definir senha**

`src/app/definir-senha/page.tsx`:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { usuarioDeEmail } from "@/lib/acessos";
import { lerSessao } from "@/server/sessao";
import { FormSenha } from "./form-senha";

export const metadata: Metadata = {
  title: "Definir senha — Grupo Norte",
  robots: { index: false },
};

export default async function DefinirSenhaPage() {
  const s = await lerSessao();
  if (!s) redirect("/auth");
  // Quem já trocou não volta para cá.
  if (!s.prov) redirect(s.admin ? "/admin" : "/vendedor");
  return <FormSenha usuario={usuarioDeEmail(s.email)} />;
}
```

`src/app/definir-senha/form-senha.tsx`: `git mv src/routes/definir-senha.tsx src/app/definir-senha/form-senha.tsx` e editar:
1. Primeira linha `"use client";`; imports: tirar `createFileRoute, redirect, useNavigate` e `supabase`; acrescentar `useRouter` de `next/navigation`, `chamar` de `@/lib/chamar`, `definirSenha` de `@/server/auth`; do `@/lib/acessos` ficam só `SENHA_MINIMO` e `senhaFraca`.
2. Apagar o bloco `export const Route = ...`.
3. `function DefinirSenhaPage()` → `export function FormSenha({ usuario }: { usuario: string })`; apagar `const { user } = Route.useRouteContext();` e `const usuario = usuarioDeEmail(user.email ?? "");`; `useNavigate()` → `useRouter()` (variável `router`).
4. Corpo do `try` de `enviar`:

```tsx
      const destino = await chamar(definirSenha(senha));
      toast.success("Senha definida. Bom trabalho!");
      router.replace(destino);
```

5. `src={logoBranco}` → `src={logoBranco.src}`.

- [ ] **Step 10: Verificar**

Run: `bun test` → tudo passa.
Run: `bun run typecheck` e `bun run build` → sem erro.
Fumaça (`bun run dev`, Playwright): `/admin` sem cookie → cai em `/auth`; login com usuário inventado → toast "Usuário ou senha incorretos."; seis tentativas erradas seguidas → "Muitas tentativas erradas…".

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: login proprio com bcrypt + cookie JWT, proxy e troca de senha"
```

---

### Task 4: Senhas do Supabase e usuários de teste

**Files:**
- Create: `scripts/copiar-senhas.ts`, `scripts/usuario-teste.ts`

**Interfaces:**
- Consumes: migração 001 aplicada (coluna `senha_hash`).
- Produces: `crm.usuarios.senha_hash` preenchido; `bun scripts/usuario-teste.ts criar|apagar` com `teste.admin` / `teste.vendedor` (senha em `SENHA_TESTE`), vendedor com slug `teste-migracao`.

- [ ] **Step 1: `scripts/copiar-senhas.ts`**

```ts
// Uma vez: traz o hash bcrypt de cada usuário do Supabase para crm.usuarios.
// Roda com: bun scripts/copiar-senhas.ts   (SUPABASE_DB_URL e PG* no .env)
import postgres from "postgres";

const url = process.env["SUPABASE_DB_URL"];
if (!url) throw new Error("Defina SUPABASE_DB_URL (Supabase → Project Settings → Database).");

// prepare: false — o pooler do Supabase em modo transação não aceita prepared statement.
const supabase = postgres(url, { ssl: "require", max: 1, prepare: false });
const crm = postgres({ connection: { search_path: "crm" }, max: 1 });

try {
  const origem = await supabase<{ id: string; encrypted_password: string | null }[]>`
    select id, encrypted_password from auth.users`;
  const hashPorId = new Map(origem.map((u) => [u.id, u.encrypted_password]));
  const destino = await crm<{ id: string; email: string }[]>`select id, email from usuarios`;

  const semHash: string[] = [];
  let copiados = 0;
  for (const u of destino) {
    const hash = hashPorId.get(u.id);
    if (!hash) {
      semHash.push(u.email);
      continue;
    }
    await crm`update usuarios set senha_hash = ${hash} where id = ${u.id}`;
    copiados++;
  }
  console.log(`${copiados} de ${destino.length} usuários com senha copiada.`);
  if (semHash.length) console.log(`Sem hash no Supabase: ${semHash.join(", ")}`);
} finally {
  await supabase.end();
  await crm.end();
}
```

- [ ] **Step 2: PEDIR a URL e o OK, e rodar**

Pedir ao usuário a connection string (Supabase → Project Settings → Database → Connection string, com a senha `SUPABASE_DB_PASSWORD` do `.env`) e o ok para gravar `senha_hash` no dbprod. Pôr em `.env` como `SUPABASE_DB_URL=...`.

Run: `bun scripts/copiar-senhas.ts` → `10 de 10 usuários com senha copiada.`
Se não conectar: parar e voltar ao usuário com o plano B (senha provisória para todos via tela de Usuários, na Tarefa 9).

- [ ] **Step 3: `scripts/usuario-teste.ts`**

```ts
// Usuários de fumaça, apagados no fim de cada tarefa que os usou.
// Roda com: SENHA_TESTE=... bun scripts/usuario-teste.ts criar|apagar
import bcrypt from "bcryptjs";
import postgres from "postgres";

const sql = postgres({ connection: { search_path: "crm" }, max: 1 });
const ADMIN = "teste.admin@acesso.gruponorte.com.br";
const VENDEDOR = "teste.vendedor@acesso.gruponorte.com.br";
const SLUG = "teste-migracao";

try {
  if (process.argv[2] === "criar") {
    const senha = process.env["SENHA_TESTE"];
    if (!senha || senha.length < 8) throw new Error("Defina SENHA_TESTE (8+ caracteres).");
    const hash = await bcrypt.hash(senha, 10);
    await sql.begin(async (tx) => {
      for (const [email, papel] of [[ADMIN, "admin"], [VENDEDOR, "vendedor"]] as const) {
        const [u] = await tx<{ id: string }[]>`
          insert into usuarios (email, senha_hash, raw_user_meta_data, email_confirmed_at)
          values (${email}, ${hash}, ${JSON.stringify({ nome: `Teste ${papel}`, usuario: email.split("@")[0] })}::jsonb, now())
          returning id`;
        await tx`insert into user_roles (user_id, role) values (${u!.id}, ${papel})`;
        if (papel === "vendedor")
          await tx`insert into vendedores (nome, slug, whatsapp, user_id)
                   values ('Teste Migração', ${SLUG}, '65999999999', ${u!.id})`;
      }
    });
    console.log("Criados teste.admin e teste.vendedor (slug teste-migracao).");
  } else if (process.argv[2] === "apagar") {
    await sql.begin(async (tx) => {
      // Pedido de teste perderia o vendedor (ON DELETE SET NULL) e ficaria órfão no painel.
      await tx`delete from pedidos where vendedor_id in (select id from vendedores where slug = ${SLUG})`;
      await tx`delete from vendedores where slug = ${SLUG}`;
      await tx`delete from usuarios where email in (${ADMIN}, ${VENDEDOR})`;
    });
    console.log("Usuários, vendedor e pedidos de teste apagados.");
  } else {
    throw new Error("Uso: bun scripts/usuario-teste.ts criar|apagar");
  }
} finally {
  await sql.end();
}
```

- [ ] **Step 4: PEDIR OK para criar os usuários de teste, criar e testar login**

Com o ok: `SENHA_TESTE=<gerada> bun scripts/usuario-teste.ts criar`.
Fumaça: login `teste.admin` → redireciona para `/admin` (404 por enquanto — a área logada vem na Tarefa 6; o que se confere aqui é o redirecionamento e o cookie `sessao` httpOnly). Pedir ao usuário que confirme o login com a própria conta (a senha copiada do Supabase).
Não apagar os usuários de teste ainda: as Tarefas 5 a 9 usam. A Tarefa 10 apaga.

- [ ] **Step 5: Commit**

```bash
git add scripts/copiar-senhas.ts scripts/usuario-teste.ts
git commit -m "chore: scripts de copia de senhas do Supabase e usuarios de teste"
```

---

### Task 5: Catálogo público e pedido

**Files:**
- Create: `src/server/publico.ts`, `src/app/c/[slug]/page.tsx`, `src/app/c/[slug]/[distribuidora]/page.tsx`
- Move+modify: `src/routes/c.$slug.index.tsx` → `src/app/c/[slug]/escolher-catalogo.tsx`; `src/routes/c.$slug.$distribuidora.tsx` → `src/app/c/[slug]/[distribuidora]/catalogo.tsx`
- Modify: `src/hooks/use-vendedor-publico.ts`, `src/hooks/use-catalogos-publicos.ts`, `tsconfig.json` (tirar os dois hooks do `exclude`)

**Interfaces:**
- Consumes: `sql`, `condicaoBusca`, `acao`, `Recusa`, `chamar`, `ipDaRequisicao`, `PAGINA_VITRINE`, `UNIDADES`.
- Produces:
  - `vendedorPorSlug(slug) → { id, nome, whatsapp } | null`
  - `catalogosPublicos() → CatalogoPublico[]`
  - `vitrine(distribuidoraSlug) → { id, nome, cor, emoji, imagem_url, secoes: { id, nome }[] } | null`
  - `produtosDaVitrine({ distribuidoraId, secaoId, termo, pagina }) → { id, codigo, nome, arquivo }[]`
  - `criarPedido({ vendedorId, distribuidoraId, clienteNome, observacao, itens: { codigo, nome, quantidade, unidade }[] }) → string` (id)

- [ ] **Step 1: `src/server/publico.ts`**

```ts
"use server";

import { createHash } from "node:crypto";
import { z } from "zod";

import type { CatalogoPublico } from "@/hooks/use-catalogos-publicos";
import { PAGINA_VITRINE, UNIDADES, type Unidade } from "@/lib/catalogo";
import { acao, Recusa } from "@/server/acao";
import { condicaoBusca, sql } from "@/server/db";
import { ipDaRequisicao } from "@/server/sessao";

// Tudo aqui é público (cliente sem login): nada de lista de vendedores.

/** UM vendedor, o do slug do link. Nome e WhatsApp da equipe inteira não são públicos. */
export const vendedorPorSlug = acao(async (slug: string) => {
  const [v] = await sql<{ id: string; nome: string; whatsapp: string }[]>`
    select id, nome, whatsapp from vendedores where slug = ${String(slug)} and ativo`;
  return v ?? null;
});

export const catalogosPublicos = acao(async () => [
  ...(await sql<CatalogoPublico[]>`
    select id, nome, slug, cor, emoji, imagem_url, personalizado
      from distribuidoras where ativo order by nome`),
]);

/** Cabeçalho do catálogo e as abas numa ida só: as actions do client rodam uma por vez. */
export const vitrine = acao(async (distribuidoraSlug: string) => {
  const [d] = await sql<
    { id: string; nome: string; cor: string; emoji: string | null; imagem_url: string | null }[]
  >`
    select id, nome, cor, emoji, imagem_url
      from distribuidoras where slug = ${String(distribuidoraSlug)} and ativo`;
  if (!d) return null;
  const secoes = await sql<{ id: string; nome: string }[]>`
    select id, nome from catalogo_secoes where distribuidora_id = ${d.id} order by ordem, nome`;
  return { ...d, secoes: [...secoes] };
});

const filtroVitrine = z.object({
  distribuidoraId: z.string().uuid(),
  secaoId: z.string().uuid().or(z.literal("")),
  termo: z.string().max(200),
  pagina: z.number().int().min(0).max(10_000),
});

export const produtosDaVitrine = acao(async (entrada: z.input<typeof filtroVitrine>) => {
  const f = filtroVitrine.parse(entrada);
  return [
    ...(await sql<{ id: string; codigo: string; nome: string; arquivo: string | null }[]>`
      select p.id, p.codigo, p.nome, p.arquivo
        from produtos p
        join distribuidora_produtos dp on dp.produto_id = p.id
       where dp.distribuidora_id = ${f.distribuidoraId}
         and p.ativo
         ${f.secaoId ? sql`and dp.secao_id = ${f.secaoId}` : sql``}
         ${condicaoBusca(f.termo)}
       -- O ERP repete nome: sem desempate a rolagem repete um card e perde outro.
       order by p.nome, p.id
       limit ${PAGINA_VITRINE} offset ${f.pagina * PAGINA_VITRINE}`),
  ];
});

// Os limites são os CHECKs do banco: campo gigante não entra.
const pedidoSchema = z.object({
  vendedorId: z.string().uuid(),
  distribuidoraId: z.string().uuid(),
  clienteNome: z.string().trim().max(120),
  observacao: z.string().trim().max(500),
  itens: z
    .array(
      z.object({
        codigo: z.string().min(1).max(60),
        nome: z.string().min(1).max(200),
        quantidade: z.number().int().min(1).max(9999),
        unidade: z.enum(UNIDADES.map((u) => u.valor) as [Unidade, ...Unidade[]]),
      }),
    )
    .min(1)
    .max(2000),
});

export const criarPedido = acao(async (entrada: z.input<typeof pedidoSchema>) => {
  const p = pedidoSchema.parse(entrada);
  const ip = await ipDaRequisicao();
  // Freio de spam por origem. Guarda o md5 do IP, não o IP: agrupa rajadas sem
  // virar cadastro de endereço de ninguém. Sem IP (dev local), sem freio.
  const origem = ip ? createHash("md5").update(ip).digest("hex") : null;

  return sql.begin(async (tx) => {
    if (origem) {
      const [{ recentes }] = await tx<{ recentes: number }[]>`
        select count(*)::int as recentes from pedidos
         where origem_hash = ${origem} and created_at > now() - interval '1 minute'`;
      if (recentes >= 10)
        throw new Recusa("Muitos pedidos seguidos. Espere um minuto e tente de novo.");
    }
    // total_itens é recalculado pelo trigger de pedido_itens; aqui só passa o CHECK > 0.
    const [pedido] = await tx<{ id: string }[]>`
      insert into pedidos (vendedor_id, distribuidora_id, cliente_nome, observacao, total_itens, origem_hash)
      values (${p.vendedorId}, ${p.distribuidoraId}, ${p.clienteNome || null},
              ${p.observacao || null}, ${p.itens.reduce((s, i) => s + i.quantidade, 0)}, ${origem})
      returning id`;
    await tx`
      insert into pedido_itens ${tx(
        p.itens.map((i) => ({ pedido_id: pedido!.id, ...i })),
        "pedido_id",
        "codigo",
        "nome",
        "quantidade",
        "unidade",
      )}`;
    return pedido!.id;
  });
});
```

- [ ] **Step 2: Hooks**

`src/hooks/use-vendedor-publico.ts` (corpo novo, mantendo o JSDoc):

```ts
import { useQuery } from "@tanstack/react-query";

import { chamar } from "@/lib/chamar";
import { vendedorPorSlug } from "@/server/publico";

/**
 * O catálogo público precisa de UM vendedor — o do slug que o cliente recebeu.
 * A lista de vendedores não é pública, senão qualquer um baixava nome e WhatsApp
 * da equipe inteira.
 */
export function useVendedorPublico(slug: string) {
  return useQuery({
    queryKey: ["vendedor", slug],
    queryFn: () => chamar(vendedorPorSlug(slug)),
  });
}
```

`src/hooks/use-catalogos-publicos.ts`: trocar o import do `supabase` por `import { chamar } from "@/lib/chamar";` e `import { catalogosPublicos } from "@/server/publico";`; o `queryFn` vira `queryFn: () => chamar(catalogosPublicos()),`. Tipo e JSDoc ficam.

Em `tsconfig.json`, tirar do `exclude` as linhas `src/hooks/use-catalogos-publicos.ts` e `src/hooks/use-vendedor-publico.ts`.

- [ ] **Step 3: Escolha de catálogo `/c/[slug]`**

`src/app/c/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";

import { EscolherCatalogo } from "./escolher-catalogo";

export const metadata: Metadata = {
  title: "Escolha o catálogo — faça seu pedido",
  description: "Escolha o catálogo para ver os produtos e montar seu pedido pelo WhatsApp.",
  openGraph: {
    title: "Escolha o catálogo — faça seu pedido",
    description: "Escolha o catálogo para ver os produtos e montar seu pedido.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function Page() {
  return <EscolherCatalogo />;
}
```

`git mv 'src/routes/c.$slug.index.tsx' 'src/app/c/[slug]/escolher-catalogo.tsx'` e editar:
1. `"use client";` no topo; `import Link from "next/link";` e `import { useParams } from "next/navigation";` no lugar do import do TanStack.
2. Apagar o bloco `export const Route = ...`.
3. No `CartaoCatalogo`: `to="/c/$slug/$distribuidora"` + `params={{ slug, distribuidora: catalogo.slug }}` → `href={`/c/${slug}/${catalogo.slug}`}`.
4. `function EscolherCatalogo()` → `export function EscolherCatalogo()`; `const { slug } = Route.useParams();` → `const { slug } = useParams<{ slug: string }>();`.
5. `if (vendedorQuery.isLoading)` → `if (vendedorQuery.isPending)`. No servidor a query não roda, e `isLoading` falso mostraria "Link não encontrado" antes de carregar.
6. `<Link to="/" ...>` → `<Link href="/" ...>`.

- [ ] **Step 4: Catálogo `/c/[slug]/[distribuidora]`**

`src/app/c/[slug]/[distribuidora]/page.tsx`:

```tsx
import type { Metadata } from "next";

import { Catalogo } from "./catalogo";

export const metadata: Metadata = {
  title: "Catálogo de produtos — faça seu pedido",
  description:
    "Escolha os produtos e as quantidades desejadas e envie seu pedido direto para o vendedor pelo WhatsApp.",
  openGraph: {
    title: "Catálogo de produtos — faça seu pedido",
    description: "Monte sua lista de produtos e envie o pedido pelo WhatsApp.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function Page() {
  return <Catalogo />;
}
```

`git mv 'src/routes/c.$slug.$distribuidora.tsx' 'src/app/c/[slug]/[distribuidora]/catalogo.tsx'` e editar:
1. `"use client";` no topo. Imports: `import Link from "next/link";`, `import { useParams } from "next/navigation";`; tirar o TanStack Router e o `supabase`; acrescentar `import { chamar } from "@/lib/chamar";`, `import { mensagemErro } from "@/lib/erros";`, `import { criarPedido, produtosDaVitrine, vitrine } from "@/server/publico";`; no import de `@/lib/catalogo`, trocar `filtrosBusca` por `PAGINA_VITRINE`.
2. Apagar o bloco `export const Route = ...` e `const PAGE = 24;`.
3. `function CatalogoPage()` → `export function Catalogo()`; `Route.useParams()` → `useParams<{ slug: string; distribuidora: string }>()`.
4. `distribuidoraQuery` inteiro vira:

```tsx
  const distribuidoraQuery = useQuery({
    queryKey: ["distribuidora", distribuidoraSlug],
    queryFn: () => chamar(vitrine(distribuidoraSlug)),
  });
```

5. Apagar o `secoesQuery` inteiro e trocar `const secoes = secoesQuery.data ?? [];` por `const secoes = distribuidora?.secoes ?? [];`.
6. `produtosQuery`:

```tsx
  const produtosQuery = useInfiniteQuery({
    queryKey: ["catalogo", distribuidora?.id, secaoId, termo],
    enabled: !!distribuidora?.id,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      chamar(
        produtosDaVitrine({
          distribuidoraId: distribuidora!.id,
          secaoId,
          termo,
          pagina: pageParam,
        }),
      ),
    getNextPageParam: (last, pages) =>
      last.length === PAGINA_VITRINE ? pages.length : undefined,
  });
```

7. Em `concluir`, trocar do `const pedidoId = crypto.randomUUID();` até o fim do segundo insert por:

```tsx
      await chamar(
        criarPedido({
          vendedorId: vendedor.id,
          distribuidoraId: distribuidora.id,
          clienteNome: cliente,
          observacao,
          itens: itens.map((i) => ({
            codigo: i.codigo,
            nome: i.nome,
            quantidade: i.quantidade,
            unidade: i.unidade,
          })),
        }),
      );
```

e no `catch`: `toast.error(mensagemErro(e, "Não foi possível enviar o pedido. Tente novamente."));` (o freio de spam agora chega à tela com a mensagem dele).
8. `if (vendedorQuery.isLoading || distribuidoraQuery.isLoading)` → `isPending` nos dois.
9. `<Link to="/" ...>` → `<Link href="/" ...>`.

- [ ] **Step 5: Verificar**

Run: `bun run typecheck`, `bun test`, `bun run build` → ok.
Fumaça (`bun run dev`, Playwright, sem login):
- `/c/teste-migracao` lista distribuidoras e seleções especiais; `/c/slug-que-nao-existe` → "Link não encontrado".
- `/c/teste-migracao/dunorte`: grade carrega, "Carregar mais" traz a página 2, busca "sabao po" filtra, abas de seção trocam.
- Adicionar 2 itens (1 em Caixa), concluir → abre `wa.me` com a mensagem; no banco, o último pedido do vendedor `teste-migracao` tem `total_itens` igual à soma e 2 linhas em `pedido_itens` com a unidade certa. (Pedido de teste: fica para o `usuario-teste.ts apagar`, que já tem ok desta tarefa via Tarefa 4 — confirmar com o usuário antes de concluir o pedido.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: catalogo publico e pedido via Server Actions"
```

---

### Task 6: Área logada, vendedor, pedidos e painel

**Files:**
- Create: `src/server/pedidos.ts`, `src/components/app-shell.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/admin/layout.tsx`
- Move+modify: `_authenticated/vendedor.tsx` → `src/app/(app)/vendedor/page.tsx`; `_authenticated/meus-pedidos.tsx` → `src/app/(app)/meus-pedidos/page.tsx`; `_authenticated/admin.index.tsx` → `src/app/(app)/admin/page.tsx`; `_authenticated/admin.pedidos.tsx` → `src/app/(app)/admin/pedidos/page.tsx`
- Modify: `src/hooks/use-meu-vendedor.ts`, `src/components/lista-pedidos.tsx`, `tsconfig.json`
- Delete: `src/routes/_authenticated/route.tsx`, `src/routes/_authenticated/admin.tsx`

**Interfaces:**
- Consumes: `exigirLogin`, `exigirAdmin`, `lerSessao`, `sair` (Tarefa 3); `catalogosPublicos` (Tarefa 5).
- Produces:
  - `meuVendedor() → { id, nome, slug, whatsapp } | null`
  - `meusPedidos(inicio: string, fim: string) → PedidoDaLista[]`
  - `pedidosDoPeriodo(inicio, fim) → PedidoDaLista[]` (admin)
  - `fotosPorCodigo(codigos: string[]) → Record<string, string | null>`
  - `resumoPainel(desde, ate) → PedidoResumo[]` (admin); `type PedidoResumo = { created_at: string; total_itens: number; vendedor_id: string | null; vendedores: { nome: string } | null }`
  - `vendedoresAtivos() → { id, nome, slug }[]` (admin)
  - `useMeuVendedor()` sem parâmetro; `<AppShell email admin>`

- [ ] **Step 1: `src/server/pedidos.ts`**

```ts
"use server";

import { z } from "zod";

import type { PedidoDaLista } from "@/components/lista-pedidos";
import { acao } from "@/server/acao";
import { sql } from "@/server/db";
import { exigirAdmin, exigirLogin } from "@/server/sessao";

export type PedidoResumo = {
  created_at: string;
  total_itens: number;
  vendedor_id: string | null;
  vendedores: { nome: string } | null;
};

const periodo = z.tuple([z.string().datetime(), z.string().datetime()]);

/** Mesma forma que o embed do PostgREST devolvia: itens, vendedor e distribuidora aninhados. */
async function listaPedidos(inicio: string, fim: string, vendedorId: string | null) {
  const [de, ate] = periodo.parse([inicio, fim]);
  return [
    ...(await sql<PedidoDaLista[]>`
      select p.id, p.cliente_nome, p.observacao, p.total_itens, p.created_at,
             case when v.id is null then null else json_build_object('nome', v.nome) end as vendedores,
             case when d.id is null then null else json_build_object('nome', d.nome) end as distribuidoras,
             coalesce((select json_agg(json_build_object('codigo', i.codigo, 'nome', i.nome,
                                                         'quantidade', i.quantidade, 'unidade', i.unidade)
                                       order by i.created_at, i.id)
                         from pedido_itens i where i.pedido_id = p.id), '[]'::json) as pedido_itens
        from pedidos p
        left join vendedores v on v.id = p.vendedor_id
        left join distribuidoras d on d.id = p.distribuidora_id
       where p.created_at between ${de} and ${ate}
         ${vendedorId ? sql`and p.vendedor_id = ${vendedorId}` : sql``}
       order by p.created_at desc`),
  ];
}

export const meuVendedor = acao(async () => {
  const s = await exigirLogin();
  const [v] = await sql<{ id: string; nome: string; slug: string; whatsapp: string }[]>`
    select id, nome, slug, whatsapp from vendedores where user_id = ${s.sub}`;
  return v ?? null;
});

/** O vendedor sai da sessão, nunca do client: ninguém enxerga pedido de outro. */
export const meusPedidos = acao(async (inicio: string, fim: string) => {
  const s = await exigirLogin();
  const [v] = await sql<{ id: string }[]>`select id from vendedores where user_id = ${s.sub}`;
  return v ? listaPedidos(inicio, fim, v.id) : [];
});

export const pedidosDoPeriodo = acao(async (inicio: string, fim: string) => {
  await exigirAdmin();
  return listaPedidos(inicio, fim, null);
});

/**
 * pedido_itens guarda só código/nome/quantidade, então a foto vem de produtos.
 * Não há FK entre os dois de propósito: apagar produto não derruba histórico.
 */
export const fotosPorCodigo = acao(async (codigos: string[]) => {
  await exigirLogin();
  const lista = z.array(z.string().max(60)).max(5000).parse(codigos);
  const linhas = await sql<{ codigo: string; arquivo: string | null }[]>`
    select codigo, arquivo from produtos where codigo = any(${sql.array(lista)})`;
  return Object.fromEntries(linhas.map((p) => [p.codigo, p.arquivo]));
});

export const resumoPainel = acao(async (desde: string, ate: string) => {
  await exigirAdmin();
  const [de, fim] = periodo.parse([desde, ate]);
  return [
    ...(await sql<PedidoResumo[]>`
      select p.created_at, p.total_itens, p.vendedor_id,
             case when v.id is null then null else json_build_object('nome', v.nome) end as vendedores
        from pedidos p left join vendedores v on v.id = p.vendedor_id
       where p.created_at between ${de} and ${fim}
       order by p.created_at`),
  ];
});

export const vendedoresAtivos = acao(async () => {
  await exigirAdmin();
  return [
    ...(await sql<{ id: string; nome: string; slug: string }[]>`
      select id, nome, slug from vendedores where ativo order by nome`),
  ];
});
```

- [ ] **Step 2: Hook e lista de pedidos**

`src/hooks/use-meu-vendedor.ts`:

```ts
import { useQuery } from "@tanstack/react-query";

import { chamar } from "@/lib/chamar";
import { meuVendedor } from "@/server/pedidos";

/**
 * Cadastro de vendedor da conta logada. Fica num hook porque duas telas precisam
 * dele — com a chave de cache igual nas duas, é uma ida à rede só. A conta vem da
 * sessão no servidor; o logout limpa o cache.
 */
export function useMeuVendedor() {
  return useQuery({ queryKey: ["meu-vendedor"], queryFn: () => chamar(meuVendedor()) });
}
```

`src/components/lista-pedidos.tsx`: trocar o import do `supabase` por `import { chamar } from "@/lib/chamar";` e `import { fotosPorCodigo } from "@/server/pedidos";`; o `queryFn` de `fotosQuery` vira `queryFn: () => chamar(fotosPorCodigo(codigos)),`.

Em `tsconfig.json`, tirar do `exclude` `src/hooks/use-meu-vendedor.ts` e `src/components/lista-pedidos.tsx`.

- [ ] **Step 3: Shell**

`git mv src/routes/_authenticated/route.tsx src/components/app-shell.tsx` e editar:
1. `"use client";` no topo. Import do TanStack Router → `import Link from "next/link";` e `import { usePathname, useRouter } from "next/navigation";`. `useIsFetching, useQueryClient` ficam. `import { useEffect, useState, type ReactNode } from "react";`. Tirar `supabase` e `senhaEhProvisoria`; acrescentar `import { chamar } from "@/lib/chamar";` e `import { sair as encerrarSessao } from "@/server/auth";`.
2. Apagar o bloco `export const Route = createFileRoute("/_authenticated")({ ... });`.
3. `useTemaEscuro` passa a ser seguro no SSR (o shell agora renderiza no servidor):

```tsx
function useTemaEscuro() {
  // null até montar: localStorage não existe no servidor.
  const [escuro, setEscuro] = useState<boolean | null>(null);
  useEffect(() => setEscuro(localStorage.getItem("tema") === "dark"), []);
  useEffect(() => {
    if (escuro === null) return;
    document.documentElement.classList.toggle("dark", escuro);
    localStorage.setItem("tema", escuro ? "dark" : "light");
  }, [escuro]);
  return [!!escuro, (v: boolean) => setEscuro(v)] as const;
}
```

4. `function AppShell()` → `export function AppShell({ email, admin, children }: { email: string; admin: boolean; children: ReactNode })`; apagar `const { user, admin } = Route.useRouteContext();`; `const navigate = useNavigate();` → `const router = useRouter();`; `useRouterState(...)` → `const pathname = usePathname();`.
5. Logo abaixo, o substituto do `ssr: false` que as telas tinham no TanStack:

```tsx
  // ponytail: as telas logadas eram ssr:false no TanStack e leem window e
  // localStorage no render. Montar o conteúdo só no navegador mantém isso; o
  // shell em volta continua vindo do servidor.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
```

6. Apagar o `useEffect` do `onAuthStateChange` (quem cobre sessão vencida agora é o `proxy.ts`).
7. `sair()`:

```tsx
  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await chamar(encerrarSessao());
    router.replace("/auth");
  }
```

8. No menu, o `Link` do TanStack com `activeOptions/activeProps` vira:

```tsx
                  {g.itens.map((i) => {
                    const ativo = i.exact
                      ? pathname === i.to
                      : pathname === i.to || pathname.startsWith(`${i.to}/`);
                    return (
                      <SidebarMenuItem key={i.to}>
                        <SidebarMenuButton asChild tooltip={i.label}>
                          <Link
                            href={i.to}
                            className={cn(
                              ativo &&
                                "bg-sidebar-primary text-sidebar-primary-foreground font-semibold hover:bg-sidebar-primary hover:text-sidebar-primary-foreground",
                            )}
                          >
                            <i.icon />
                            <span>{i.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
```

9. `src={logoBranco}` → `src={logoBranco.src}`; `user.email ?? "?"` → `email`; `{user.email}` → `{email}`.
10. `<Outlet />` → `{montado ? children : null}`.

`git rm src/routes/_authenticated/admin.tsx`.

- [ ] **Step 4: Layouts da área logada**

`src/app/(app)/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { lerSessao } from "@/server/sessao";

export default async function AreaLogada({ children }: { children: ReactNode }) {
  const s = await lerSessao();
  if (!s) redirect("/auth");
  if (s.prov) redirect("/definir-senha");
  return (
    <AppShell email={s.email} admin={s.admin}>
      {children}
    </AppShell>
  );
}
```

`src/app/(app)/admin/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { lerSessao } from "@/server/sessao";

// Navegação só: as actions de admin conferem o papel no banco a cada chamada.
export default async function AreaAdmin({ children }: { children: ReactNode }) {
  const s = await lerSessao();
  if (!s?.admin) redirect("/vendedor");
  return children;
}
```

- [ ] **Step 5: Telas do vendedor**

`git mv src/routes/_authenticated/vendedor.tsx 'src/app/(app)/vendedor/page.tsx'`:
1. `"use client";` no topo; tirar o import do TanStack e o bloco `export const Route`.
2. `function PainelVendedor()` → `export default function PainelVendedor()`; apagar a linha do `Route.useRouteContext()` e o comentário `ponytail` acima dela; `useMeuVendedor(user.id)` → `useMeuVendedor()`.

`git mv src/routes/_authenticated/meus-pedidos.tsx 'src/app/(app)/meus-pedidos/page.tsx'`:
1. `"use client";`; tirar TanStack, `Route` e o import do `supabase`; acrescentar `import { chamar } from "@/lib/chamar";` e `import { meusPedidos } from "@/server/pedidos";`.
2. `export default function MeusPedidosPage()`; apagar `const { user } = Route.useRouteContext();`; `useMeuVendedor(user.id)` → `useMeuVendedor()`.
3. `pedidosQuery` (manter o comentário `ponytail` sobre paginação; trocar o comentário da policy por "O servidor filtra pelo vendedor da sessão"):

```tsx
  const pedidosQuery = useQuery({
    queryKey: ["meus-pedidos", inicio, fim],
    enabled: !!vendedorQuery.data?.id,
    queryFn: () => chamar(meusPedidos(inicio, fim)),
  });
```

4. `(pedidosQuery.data ?? []) as PedidoDaLista[]` → `pedidosQuery.data ?? []` (o tipo já vem da action).

- [ ] **Step 6: Painel e pedidos do admin**

`git mv src/routes/_authenticated/admin.index.tsx 'src/app/(app)/admin/page.tsx'`:
1. `"use client";`; `import Link from "next/link";` no lugar do TanStack; tirar `supabase` e o bloco `Route`; acrescentar `import { chamar } from "@/lib/chamar";` e `import { resumoPainel, vendedoresAtivos, type PedidoResumo } from "@/server/pedidos";`; apagar o `type PedidoResumo` local.
2. `function AdminHome()` → `export default function AdminHome()`.
3. `queryFn` do `pedidosQuery` → `queryFn: () => chamar(resumoPainel(inicioAnterior.toISOString(), fim.toISOString())),`; do `vendedoresQuery` → `queryFn: () => chamar(vendedoresAtivos()),`.
4. `<Link to="/admin/pedidos"` → `<Link href="/admin/pedidos"`.

`git mv src/routes/_authenticated/admin.pedidos.tsx 'src/app/(app)/admin/pedidos/page.tsx'`:
1. `"use client";`; tirar TanStack, `supabase`, `Route`; acrescentar `chamar` e `import { pedidosDoPeriodo } from "@/server/pedidos";`.
2. `export default function PedidosPage()`; `queryFn: () => chamar(pedidosDoPeriodo(inicio, fim)),`; o comentário sobre a policy vira "Admin enxerga de todos os vendedores; itens vêm aninhados numa consulta só."; `(pedidosQuery.data ?? []) as PedidoDaLista[]` → `pedidosQuery.data ?? []` e remover o import de tipo `PedidoDaLista` se ficar sem uso.

- [ ] **Step 7: Verificar — incluindo SSR de produção (Review Focus 1)**

Run: `bun run typecheck`, `bun test`, `bun run build` → ok.
Run: `bun run start` (produção, `http://localhost:8080`). Com Playwright:
- login `teste.admin` → `/admin`: KPIs e gráfico carregam; tema escuro liga/desliga e sobrevive a F5; `/admin/pedidos` lista o pedido de teste da Tarefa 5 com itens e foto.
- sair → `/auth`; `/admin` sem sessão → `/auth`.
- login `teste.vendedor` → `/vendedor` com os links (copiar link funciona); `/meus-pedidos` mostra só o pedido dele; `/admin` → redireciona para `/vendedor`.
- Em todas as páginas acima: `list_console_messages` sem erro nem aviso de hidratação.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: area logada, painel, pedidos e telas do vendedor no Next"
```

---

### Task 7: Produtos e distribuidoras (admin)

**Files:**
- Create: `src/server/produtos.ts`, `src/server/catalogos.ts`
- Move+modify: `_authenticated/admin.produtos.tsx` → `src/app/(app)/admin/produtos/page.tsx`; `_authenticated/admin.distribuidoras.tsx` → `src/app/(app)/admin/distribuidoras/page.tsx`

**Interfaces:**
- Produces:
  - `listarProdutos(termo: string, pagina: number) → { linhas: Produto[]; total: number }` (Produto = `{ id, codigo, nome, arquivo, ativo, cod_empresa }`)
  - `salvarProduto(id: string | null, { codigo, nome, arquivo }) → void`, `ativarProduto(id, ativo) → void`, `excluirProduto(id) → void`
  - `listarDistribuidoras() → { id, nome, slug, cor, ativo }[]`, `ativarCatalogo(id, ativo) → void` (também usado na Tarefa 8)

- [ ] **Step 1: `src/server/produtos.ts`**

```ts
"use server";

import { z } from "zod";

import { PAGINA_PRODUTOS } from "@/lib/catalogo";
import { acao } from "@/server/acao";
import { condicaoBusca, sql } from "@/server/db";
import { exigirAdmin } from "@/server/sessao";

type Produto = {
  id: string;
  codigo: string;
  nome: string;
  arquivo: string | null;
  ativo: boolean;
  cod_empresa: number | null;
};

export const listarProdutos = acao(async (termo: string, pagina: number) => {
  await exigirAdmin();
  const [linhas, [contagem]] = await Promise.all([
    sql<Produto[]>`
      select p.id, p.codigo, p.nome, p.arquivo, p.ativo, p.cod_empresa
        from produtos p where true ${condicaoBusca(termo)}
       -- O ERP repete nome: sem desempate a mesma linha aparece em duas páginas,
       -- e excluir a "duplicada" apaga a única que existe.
       order by p.nome, p.id
       limit ${PAGINA_PRODUTOS} offset ${pagina * PAGINA_PRODUTOS}`,
    sql<{ total: number }[]>`
      select count(*)::int as total from produtos p where true ${condicaoBusca(termo)}`,
  ]);
  return { linhas: [...linhas], total: contagem?.total ?? 0 };
});

const produtoSchema = z.object({
  codigo: z.string().trim().min(1, "Informe o código."),
  nome: z.string().trim().min(1, "Informe o nome."),
  arquivo: z.string().trim(),
});

export const salvarProduto = acao(
  async (id: string | null, entrada: z.input<typeof produtoSchema>) => {
    await exigirAdmin();
    const v = produtoSchema.parse(entrada);
    const valores = { codigo: v.codigo, nome: v.nome, arquivo: v.arquivo || null };
    if (id)
      await sql`update produtos set ${sql(valores, "codigo", "nome", "arquivo")} where id = ${id}`;
    else await sql`insert into produtos ${sql(valores, "codigo", "nome", "arquivo")}`;
  },
);

export const ativarProduto = acao(async (id: string, ativo: boolean) => {
  await exigirAdmin();
  await sql`update produtos set ativo = ${ativo} where id = ${id}`;
});

export const excluirProduto = acao(async (id: string) => {
  await exigirAdmin();
  await sql`delete from produtos where id = ${id}`;
});
```

- [ ] **Step 2: `src/server/catalogos.ts` (início — a Tarefa 8 acrescenta o resto)**

```ts
"use server";

import { acao } from "@/server/acao";
import { sql } from "@/server/db";
import { exigirAdmin } from "@/server/sessao";

// Distribuidoras e catálogos personalizados moram na mesma tabela: mesma forma
// (nome, slug, cor, lista de produtos, link público), só muda a marca.

/** Só distribuidora de verdade: personalizado se liga, desliga e exclui na tela de Catálogos. */
export const listarDistribuidoras = acao(async () => {
  await exigirAdmin();
  return [
    ...(await sql<{ id: string; nome: string; slug: string; cor: string; ativo: boolean }[]>`
      select id, nome, slug, cor, ativo from distribuidoras where not personalizado order by nome`),
  ];
});

export const ativarCatalogo = acao(async (id: string, ativo: boolean) => {
  await exigirAdmin();
  await sql`update distribuidoras set ativo = ${ativo} where id = ${id}`;
});
```

- [ ] **Step 3: Tela de produtos**

`git mv src/routes/_authenticated/admin.produtos.tsx 'src/app/(app)/admin/produtos/page.tsx'`:
1. `"use client";`; tirar TanStack, `supabase` e o bloco `Route`; `const PAGE = 30;` → apagar e importar `PAGINA_PRODUTOS as PAGE` de `@/lib/catalogo` (no mesmo import de `fotoUrl`, trocando `filtrosBusca` por ele); acrescentar `import { chamar } from "@/lib/chamar";` e `import { ativarProduto, excluirProduto, listarProdutos, salvarProduto } from "@/server/produtos";`.
2. `export default function ProdutosPage()`.
3. `useQuery` principal: `queryFn: () => chamar(listarProdutos(termo, pagina)),` (manter o comentário do desempate no servidor, apagar daqui).
4. `alternar`: `mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) => chamar(ativarProduto(id, ativo)),`
5. `salvarProduto` (a mutation; renomear a variável local para `salvar` e trocar `salvarProduto.mutate()` / `salvarProduto.isPending` por `salvar.…` no JSX, porque o nome agora é da action):

```tsx
  const salvar = useMutation({
    mutationFn: () =>
      chamar(salvarProduto(editandoId || null, { codigo, nome, arquivo })),
```

(o `onSuccess`/`onError` ficam).
6. `excluir`: `mutationFn: (id: string) => chamar(excluirProduto(id)),`

- [ ] **Step 4: Tela de distribuidoras**

`git mv src/routes/_authenticated/admin.distribuidoras.tsx 'src/app/(app)/admin/distribuidoras/page.tsx'`:
1. `"use client";`; tirar TanStack, `supabase`, `Route`; acrescentar `chamar` e `import { ativarCatalogo, listarDistribuidoras } from "@/server/catalogos";`.
2. `export default function DistribuidorasPage()`; `queryFn: () => chamar(listarDistribuidoras()),` (o comentário sobre personalizado foi para o servidor); `mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) => chamar(ativarCatalogo(id, ativo)),`.

- [ ] **Step 5: Verificar**

Run: `bun run typecheck`, `bun test`, `bun run build` → ok.
Fumaça como `teste.admin` (PEDIR OK — grava no dbprod): `/admin/produtos` pagina e busca; criar produto `TESTE-MIGRACAO` / "PRODUTO TESTE MIGRACAO"; editar a foto para uma URL; desativar; excluir (some da lista). `/admin/distribuidoras`: desligar e religar uma distribuidora (volta ao estado original).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: telas de produtos e distribuidoras via Server Actions"
```

---

### Task 8: Catálogos (admin) e imagens

**Files:**
- Modify: `src/server/catalogos.ts`
- Create: `src/app/imagens/[id]/route.ts`
- Move+modify: `_authenticated/admin.catalogo.tsx` → `src/app/(app)/admin/catalogo/page.tsx`

**Interfaces:**
- Consumes: `ativarCatalogo` (Tarefa 7), `parseCodigos`, `umCadastroPorCodigo`, `slugify`, `MAX_CODIGOS_COLADOS`, `PAGINA_CATALOGO`, `TIPOS_IMAGEM`, `MAX_IMAGEM`.
- Produces (todas admin):
  - `type Catalogo = { id, nome, slug, cor, emoji, imagem_url, personalizado, ativo }`; `type Secao = { id, nome, ordem }`
  - `listarCatalogos() → Catalogo[]`; `secoesDoCatalogo(catalogoId) → Secao[]`
  - `itensDoCatalogo({ catalogoId, secaoId, termo, pagina }) → { linhas: { produto: { id, codigo, nome, arquivo }; secaoId: string | null }[]; total }`
  - `cadastroParaAdicionar(termo, pagina) → { linhas: { id, codigo, nome, arquivo }[]; total }`
  - `jaNoCatalogo(catalogoId, produtoIds) → [produtoId, secaoId | null][]`
  - `vincular(catalogoId, produtoIds, secaoId | null) → number`; `vincularBusca(catalogoId, termo, secaoId | null) → number`
  - `desvincular(catalogoId, produtoIds) → number`; `desvincularBusca(catalogoId, secaoId, termo) → number`
  - `colarCodigos(catalogoId, texto, secaoId | null) → { total, repetidos, faltando: string[] }`
  - `enviarImagem(dados: FormData) → string` (`/imagens/<id>`)
  - `salvarCatalogo(editandoId | null, { nome, cor, emoji, imagemUrl, copiarDe }) → Catalogo`; `excluirCatalogo(id) → void`
  - `criarSecao(catalogoId, nome) → string`; `renomearSecao(id, nome)`, `ordenarSecoes(ids: string[])`, `excluirSecao(id)` → void

- [ ] **Step 1: Ações do catálogo**

Em `src/server/catalogos.ts`, trocar os imports por:

```ts
import type { TransactionSql } from "postgres";
import { z } from "zod";

import {
  MAX_CODIGOS_COLADOS,
  MAX_IMAGEM,
  PAGINA_CATALOGO,
  TIPOS_IMAGEM,
  parseCodigos,
  slugify,
  umCadastroPorCodigo,
} from "@/lib/catalogo";
import { acao, Recusa } from "@/server/acao";
import { condicaoBusca, sql } from "@/server/db";
import { exigirAdmin } from "@/server/sessao";
```

e acrescentar ao fim:

```ts
export type Catalogo = {
  id: string;
  nome: string;
  slug: string;
  cor: string;
  emoji: string | null;
  imagem_url: string | null;
  personalizado: boolean;
  ativo: boolean;
};
export type Secao = { id: string; nome: string; ordem: number };
type ProdutoResumo = { id: string; codigo: string; nome: string; arquivo: string | null };

export const listarCatalogos = acao(async () => {
  await exigirAdmin();
  return [
    ...(await sql<Catalogo[]>`
      select id, nome, slug, cor, emoji, imagem_url, personalizado, ativo
        from distribuidoras order by nome`),
  ];
});

export const secoesDoCatalogo = acao(async (catalogoId: string) => {
  await exigirAdmin();
  return [
    ...(await sql<Secao[]>`
      select id, nome, ordem from catalogo_secoes
       where distribuidora_id = ${catalogoId} order by ordem, nome`),
  ];
});

/** O catálogo em si: busca e contagem valem sobre o que está nele, não sobre o cadastro. */
export const itensDoCatalogo = acao(
  async (f: { catalogoId: string; secaoId: string; termo: string; pagina: number }) => {
    await exigirAdmin();
    const onde = () => sql`
      dp.distribuidora_id = ${f.catalogoId}
      ${f.secaoId ? sql`and dp.secao_id = ${f.secaoId}` : sql``}
      ${condicaoBusca(f.termo)}`;
    const [linhas, [contagem]] = await Promise.all([
      sql<(ProdutoResumo & { secao_id: string | null })[]>`
        select p.id, p.codigo, p.nome, p.arquivo, dp.secao_id
          from distribuidora_produtos dp join produtos p on p.id = dp.produto_id
         where ${onde()}
         -- dp.id desempata nome repetido; sem ele a paginação repete e perde item.
         order by p.nome, dp.id
         limit ${PAGINA_CATALOGO} offset ${f.pagina * PAGINA_CATALOGO}`,
      sql<{ total: number }[]>`
        select count(*)::int as total
          from distribuidora_produtos dp join produtos p on p.id = dp.produto_id
         where ${onde()}`,
    ]);
    return {
      linhas: linhas.map(({ secao_id, ...produto }) => ({ produto, secaoId: secao_id })),
      total: contagem?.total ?? 0,
    };
  },
);

/** Cadastro completo, para o modal de adicionar. */
export const cadastroParaAdicionar = acao(async (termo: string, pagina: number) => {
  await exigirAdmin();
  const [linhas, [contagem]] = await Promise.all([
    sql<ProdutoResumo[]>`
      select p.id, p.codigo, p.nome, p.arquivo from produtos p
       where true ${condicaoBusca(termo)}
       order by p.nome, p.id
       limit ${PAGINA_CATALOGO} offset ${pagina * PAGINA_CATALOGO}`,
    sql<{ total: number }[]>`
      select count(*)::int as total from produtos p where true ${condicaoBusca(termo)}`,
  ]);
  return { linhas: [...linhas], total: contagem?.total ?? 0 };
});

/**
 * Em que seção cada linha visível do modal já está. Vai pelo id da linha, nunca
 * pelo EAN: o ERP repete código, e olhar por ele amarrava as linhas.
 */
export const jaNoCatalogo = acao(async (catalogoId: string, produtoIds: string[]) => {
  await exigirAdmin();
  const linhas = await sql<{ produto_id: string; secao_id: string | null }[]>`
    select produto_id, secao_id from distribuidora_produtos
     where distribuidora_id = ${catalogoId} and produto_id = any(${sql.array(produtoIds)}::uuid[])`;
  return linhas.map((v): [string, string | null] => [v.produto_id, v.secao_id]);
});

/**
 * Liga produtos ao catálogo sem duplicar. O upsert grava a seção também: religar
 * um produto que já estava lá é o que o move de aba.
 */
async function vincularIds(catalogoId: string, ids: string[], secaoId: string | null) {
  // Repetido no mesmo INSERT faria o ON CONFLICT DO UPDATE falhar.
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return 0;
  await sql`
    insert into distribuidora_produtos (distribuidora_id, produto_id, secao_id)
    select ${catalogoId}::uuid, unnest(${sql.array(unicos)}::uuid[]), ${secaoId}::uuid
    on conflict (distribuidora_id, produto_id) do update set secao_id = excluded.secao_id`;
  return unicos.length;
}

export const vincular = acao(
  async (catalogoId: string, produtoIds: string[], secaoId: string | null) => {
    await exigirAdmin();
    return vincularIds(catalogoId, produtoIds, secaoId);
  },
);

/** "Adicionar N": tudo que a busca do modal devolve, num INSERT só. */
export const vincularBusca = acao(
  async (catalogoId: string, termo: string, secaoId: string | null) => {
    await exigirAdmin();
    const r = await sql`
      insert into distribuidora_produtos (distribuidora_id, produto_id, secao_id)
      select ${catalogoId}::uuid, p.id, ${secaoId}::uuid from produtos p
       where true ${condicaoBusca(termo)}
      on conflict (distribuidora_id, produto_id) do update set secao_id = excluded.secao_id`;
    return r.count;
  },
);

export const desvincular = acao(async (catalogoId: string, produtoIds: string[]) => {
  await exigirAdmin();
  const r = await sql`
    delete from distribuidora_produtos
     where distribuidora_id = ${catalogoId} and produto_id = any(${sql.array(produtoIds)}::uuid[])`;
  return r.count;
});

/** "Remover N": o que está à vista — a aba aberta também filtra. */
export const desvincularBusca = acao(
  async (catalogoId: string, secaoId: string, termo: string) => {
    await exigirAdmin();
    const r = await sql`
      delete from distribuidora_produtos dp using produtos p
       where p.id = dp.produto_id
         and dp.distribuidora_id = ${catalogoId}
         ${secaoId ? sql`and dp.secao_id = ${secaoId}` : sql``}
         ${condicaoBusca(termo)}`;
    return r.count;
  },
);

export const colarCodigos = acao(
  async (catalogoId: string, texto: string, secaoId: string | null) => {
    await exigirAdmin();
    const codigos = parseCodigos(texto);
    if (codigos.length === 0) throw new Recusa("Cole ao menos um código.");
    if (codigos.length > MAX_CODIGOS_COLADOS)
      throw new Recusa(
        `Cole no máximo ${MAX_CODIGOS_COLADOS} códigos por vez — vieram ${codigos.length}.`,
      );
    const linhas = await sql<{ id: string; codigo: string; noCatalogo: boolean }[]>`
      select p.id, p.codigo,
             exists (select 1 from distribuidora_produtos dp
                      where dp.produto_id = p.id and dp.distribuidora_id = ${catalogoId}) as "noCatalogo"
        from produtos p
       where p.codigo = any(${sql.array(codigos)})
       order by p.created_at`;
    // Colar 100 códigos tem que dar 100 produtos, mesmo com EAN repetido no ERP.
    const { achados, repetidos } = umCadastroPorCodigo(linhas);
    await vincularIds(catalogoId, [...achados.values()], secaoId);
    return { total: achados.size, repetidos, faltando: codigos.filter((c) => !achados.has(c)) };
  },
);

/** Substitui o bucket do Storage: a imagem fica no banco e sai por /imagens/<id>. */
export const enviarImagem = acao(async (dados: FormData) => {
  await exigirAdmin();
  const arquivo = dados.get("arquivo");
  if (!(arquivo instanceof File)) throw new Recusa("Escolha uma imagem para o catálogo.");
  if (!TIPOS_IMAGEM.includes(arquivo.type)) throw new Recusa("Use uma imagem PNG, JPG, WEBP ou GIF.");
  if (arquivo.size > MAX_IMAGEM)
    throw new Recusa("A imagem passa de 2 MB. Diminua o tamanho e tente de novo.");
  const [img] = await sql<{ id: string }[]>`
    insert into imagens (tipo, dados)
    values (${arquivo.type}, ${Buffer.from(await arquivo.arrayBuffer())})
    returning id`;
  return `/imagens/${img!.id}`;
});

const catalogoSchema = z.object({
  nome: z.string().trim().min(1, "Dê um nome ao catálogo."),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida."),
  emoji: z.string().trim().max(8).nullable(),
  imagemUrl: z.string().nullable(),
  copiarDe: z.string(),
});

/** Duplica o catálogo de origem: seções nascem de novo e cada vínculo vai para a de mesmo nome. */
async function copiarCatalogo(tx: TransactionSql, origemId: string, destinoId: string) {
  await tx`
    insert into catalogo_secoes (distribuidora_id, nome, ordem)
    select ${destinoId}::uuid, nome, ordem from catalogo_secoes where distribuidora_id = ${origemId}`;
  await tx`
    insert into distribuidora_produtos (distribuidora_id, produto_id, secao_id)
    select ${destinoId}::uuid, dp.produto_id, destino.id
      from distribuidora_produtos dp
      left join catalogo_secoes origem on origem.id = dp.secao_id
      left join catalogo_secoes destino
             on destino.distribuidora_id = ${destinoId} and destino.nome = origem.nome
     where dp.distribuidora_id = ${origemId}
    on conflict (distribuidora_id, produto_id) do nothing`;
}

export const salvarCatalogo = acao(
  async (editandoId: string | null, entrada: z.input<typeof catalogoSchema>) => {
    await exigirAdmin();
    const c = catalogoSchema.parse(entrada);
    // Emoji e imagem se excluem: o que não foi escolhido vai nulo.
    const campos = { nome: c.nome, cor: c.cor, emoji: c.emoji || null, imagem_url: c.imagemUrl };
    if (editandoId) {
      // O slug não muda ao renomear: é ele que está nos links já enviados aos clientes.
      const [salvo] = await sql<Catalogo[]>`
        update distribuidoras set ${sql(campos, "nome", "cor", "emoji", "imagem_url")}
         where id = ${editandoId}
        returning id, nome, slug, cor, emoji, imagem_url, personalizado, ativo`;
      if (!salvo) throw new Recusa("Catálogo não encontrado.");
      return salvo;
    }
    const slug = slugify(c.nome);
    if (!slug) throw new Recusa("Dê um nome ao catálogo.");
    // Transação: se a cópia falhar, o catálogo novo não fica pela metade.
    return sql.begin(async (tx) => {
      const [novo] = await tx<Catalogo[]>`
        insert into distribuidoras ${tx(
          { ...campos, slug, personalizado: true },
          "nome",
          "cor",
          "emoji",
          "imagem_url",
          "slug",
          "personalizado",
        )}
        returning id, nome, slug, cor, emoji, imagem_url, personalizado, ativo`;
      if (c.copiarDe) await copiarCatalogo(tx, c.copiarDe, novo!.id);
      return novo!;
    });
  },
);

export const excluirCatalogo = acao(async (id: string) => {
  await exigirAdmin();
  await sql`delete from distribuidoras where id = ${id}`;
});

export const criarSecao = acao(async (catalogoId: string, nome: string) => {
  await exigirAdmin();
  const limpo = String(nome ?? "").trim();
  if (!limpo) throw new Recusa("Dê um nome à seção.");
  const [s] = await sql<{ id: string }[]>`
    insert into catalogo_secoes (distribuidora_id, nome, ordem)
    values (${catalogoId}, ${limpo},
            (select count(*) from catalogo_secoes where distribuidora_id = ${catalogoId}))
    returning id`;
  return s!.id;
});

export const renomearSecao = acao(async (id: string, nome: string) => {
  await exigirAdmin();
  const limpo = String(nome ?? "").trim();
  if (!limpo) throw new Recusa("Dê um nome à seção.");
  await sql`update catalogo_secoes set nome = ${limpo} where id = ${id}`;
});

/**
 * ponytail: regrava a ordem inteira em vez de trocar duas linhas — são poucas
 * seções, e assim a lista se conserta sozinha se a ordem repetir.
 */
export const ordenarSecoes = acao(async (ids: string[]) => {
  await exigirAdmin();
  await sql.begin((tx) =>
    ids.map((id, ordem) => tx`update catalogo_secoes set ordem = ${ordem} where id = ${id}`),
  );
});

export const excluirSecao = acao(async (id: string) => {
  await exigirAdmin();
  // SET NULL na FK: os produtos da seção continuam no catálogo, sem seção.
  await sql`delete from catalogo_secoes where id = ${id}`;
});
```

- [ ] **Step 2: Rota da imagem**

`src/app/imagens/[id]/route.ts`:

```ts
import { sql } from "@/server/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Público como era o bucket: a imagem aparece para o cliente sem login.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response(null, { status: 404 });
  const [img] = await sql<{ tipo: string; dados: Buffer }[]>`
    select tipo, dados from imagens where id = ${id}`;
  if (!img) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(img.dados), {
    headers: {
      "Content-Type": img.tipo,
      // Nome novo a cada envio: a mesma URL nunca muda de conteúdo.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
```

- [ ] **Step 3: Tela de catálogos**

`git mv src/routes/_authenticated/admin.catalogo.tsx 'src/app/(app)/admin/catalogo/page.tsx'` e editar, na ordem do arquivo:

1. `"use client";` no topo; tirar `createFileRoute` e `supabase`. Acrescentar:

```tsx
import { chamar } from "@/lib/chamar";
import {
  ativarCatalogo,
  cadastroParaAdicionar,
  colarCodigos,
  criarSecao as criarSecaoAcao,
  desvincular,
  desvincularBusca,
  enviarImagem,
  excluirCatalogo,
  excluirSecao as excluirSecaoAcao,
  itensDoCatalogo,
  jaNoCatalogo,
  listarCatalogos,
  ordenarSecoes,
  renomearSecao as renomearSecaoAcao,
  salvarCatalogo as salvarCatalogoAcao,
  secoesDoCatalogo,
  vincular,
  vincularBusca,
  type Catalogo,
  type Secao,
} from "@/server/catalogos";
```

(os aliases `*Acao` evitam colisão com as mutations de mesmo nome.) No import de `@/lib/catalogo`: tirar `filtrosBusca`, `MAX_CODIGOS_COLADOS`, `parseCodigos`, `umCadastroPorCodigo`; acrescentar `MAX_IMAGEM`, `TIPOS_IMAGEM`, `PAGINA_CATALOGO as PAGINA`.
2. Apagar o bloco `export const Route = ...`, as constantes `PAGINA`, `LOTE`, `LOTE_BUSCA`, `COLUNAS_CATALOGO`, e as constantes locais `TIPOS_IMAGEM`/`MAX_IMAGEM` com o comentário delas.
3. `enviarImagem` local vira:

```tsx
/** Sobe a imagem do catálogo e devolve a URL que vai para `imagem_url`. */
async function enviarImagemDoCatalogo(arquivo: File) {
  const dados = new FormData();
  dados.set("arquivo", arquivo);
  return chamar(enviarImagem(dados));
}
```

4. Apagar os tipos locais `Secao` e `Catalogo` (vêm do servidor) e a função `vincular` local inteira (com o JSDoc).
5. `function CatalogoPage()` → `export default function CatalogoPage()`.
6. `catalogosQuery.queryFn` → `() => chamar(listarCatalogos())`; `secoesQuery.queryFn` → `() => chamar(secoesDoCatalogo(catalogoId))`; retirar os `as Catalogo[]`/`as Secao[]`.
7. `catalogoQuery.queryFn` → `() => chamar(itensDoCatalogo({ catalogoId, secaoId, termo, pagina }))` (o comentário sobre `!inner` sai; o do desempate foi para o servidor).
8. `cadastroQuery.queryFn` → `() => chamar(cadastroParaAdicionar(termoAdd, paginaAdd))`.
9. `jaNoCatalogoQuery.queryFn` → `async () => new Map(await chamar(jaNoCatalogo(catalogoId, idsVisiveisNoModal)))`.
10. `adicionar` e `remover` passam a aceitar ids ou `"busca"`:

```tsx
  const adicionar = useMutation({
    mutationFn: (alvo: string[] | "busca") =>
      chamar(
        alvo === "busca"
          ? vincularBusca(catalogoId, termoAdd, secaoId || null)
          : vincular(catalogoId, alvo, secaoId || null),
      ),
```

```tsx
  const remover = useMutation({
    mutationFn: (alvo: string[] | "busca") =>
      chamar(
        alvo === "busca"
          ? desvincularBusca(catalogoId, secaoId, termo)
          : desvincular(catalogoId, alvo),
      ),
```

(`onSuccess`/`onError` ficam iguais.)
11. Apagar `todosOsIds` e `copiarCatalogo` inteiros (com JSDoc).
12. `salvarCatalogo.mutationFn`:

```tsx
    mutationFn: async () => {
      const limpo = nome.trim();
      if (!limpo || !novoSlug) throw new Error("Dê um nome ao catálogo.");
      let imagem: string | null = null;
      if (icone === "imagem") {
        imagem = imagemNova ? await enviarImagemDoCatalogo(imagemNova) : imagemUrl;
        if (!imagem) throw new Error("Escolha uma imagem para o catálogo.");
      }
      return chamar(
        salvarCatalogoAcao(editando?.id ?? null, {
          nome: limpo,
          cor,
          emoji: icone === "emoji" ? emoji.trim() || null : null,
          imagemUrl: imagem,
          copiarDe: editando ? "" : copiarDe,
        }),
      );
    },
```

13. `colar.mutationFn` → `() => chamar(colarCodigos(catalogoId, textoCodigos, secaoId || null)),` (as validações de vazio/máximo foram para o servidor com o mesmo texto).
14. `alternarAtivo.mutationFn` → `(ativo: boolean) => chamar(ativarCatalogo(catalogoId, ativo)),`; `excluir.mutationFn` → `() => chamar(excluirCatalogo(catalogoId)),`.
15. `criarSecao.mutationFn` → `(nomeSecao: string) => chamar(criarSecaoAcao(catalogoId, nomeSecao)),`; `renomearSecao.mutationFn` → `(nomeNovo: string) => chamar(renomearSecaoAcao(secaoId, nomeNovo)),`; `excluirSecao.mutationFn` → `() => chamar(excluirSecaoAcao(secaoId)),`.
16. `moverSecao.mutationFn`: manter o cálculo de `nova`, trocar o `for` (e o comentário `ponytail`, que foi para o servidor) por `await chamar(ordenarSecoes(nova.map((s) => s.id)));`.
17. No JSX: `remover.mutate(await todosOsIds(true, termo));` → `remover.mutate("busca");` (o `onClick` deixa de ser `async` se só sobrar o confirm); `onClick={async () => adicionar.mutate(await todosOsIds(false, termoAdd))}` → `onClick={() => adicionar.mutate("busca")}`.

- [ ] **Step 4: Verificar — incluindo imagem perto do limite (Review Focus 4)**

Run: `bun run typecheck`, `bun test`, `bun run build` → ok.
Fumaça como `teste.admin` em `bun run start` (PEDIR OK — grava no dbprod; tudo criado aqui é apagado no fim):
- Criar personalizado "Teste Migração" com **imagem PNG de ~1,8 MB** (gerar com Playwright/canvas ou um arquivo local) e "copiar de" um catálogo que tenha seções → aparece com imagem; `/imagens/<id>` responde `200` com `Content-Type: image/png`; as seções e itens foram copiados.
- Imagem de ~2,5 MB → toast "A imagem passa de 2 MB…".
- Criar seção, renomear, mover, adicionar 1 produto pelo modal, "Adicionar N" com busca curta, colar 3 códigos (1 inexistente → aparece em "sem cadastro"), "Remover N" com busca, remover 1.
- Editar o catálogo trocando para emoji → o slug não muda.
- Excluir o catálogo "Teste Migração". Depois: `delete from imagens where id = '<id>'` (PEDIR OK junto com o resto).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: tela de catalogos com secoes, vinculos e imagem no banco"
```

---

### Task 9: Usuários (acessos)

**Files:**
- Create: `src/server/acessos.ts`
- Move+modify: `_authenticated/admin.usuarios.tsx` → `src/app/(app)/admin/usuarios/page.tsx`
- Delete: `src/lib/acessos.functions.ts`; tirar a linha dele do `exclude` do `tsconfig.json`

**Interfaces:**
- Produces (todas admin): `listarAcessos() → Linha[]`, `criarAcesso({ tipo, nome, usuario, email, whatsapp }) → { nome, usuario, senha }`, `criarAcessoVendedor(vendedorId) → { nome, usuario, senha }`, `resetarSenha(usuarioId) → { nome, usuario, senha }`, `excluirAcesso({ vendedorId?, usuarioId? }) → { ok: true }`, `atualizarAcesso({ usuarioId?, vendedorId?, nome, email, whatsapp }) → { ok: true }` — mesmos contratos de `lib/acessos.functions.ts`.

- [ ] **Step 1: `src/server/acessos.ts`**

```ts
"use server";

import bcrypt from "bcryptjs";
import type { TransactionSql } from "postgres";
import { z } from "zod";

import {
  ALFABETO_SENHA,
  USUARIO_MAX,
  USUARIO_MIN,
  USUARIO_REGEX,
  emailDeUsuario,
  gerarSenha,
  normalizarUsuario,
  sortear,
  usuarioDeEmail,
  usuarioDeNome,
} from "@/lib/acessos";
import { slugify, somenteDigitos } from "@/lib/catalogo";
import { acao, Recusa } from "@/server/acao";
import { sql } from "@/server/db";
import { exigirAdmin } from "@/server/sessao";

type Meta = Record<string, unknown>;
type Vendedor = {
  id: string;
  nome: string;
  slug: string;
  whatsapp: string;
  ativo: boolean;
  user_id: string | null;
  created_at: string;
};

/**
 * Com `usuario` informado, respeita a escolha e falha se estiver em uso — quem
 * digitou precisa saber, e não receber um "fulano2" por baixo dos panos. Sem ele
 * (vendedor órfão, que não tem formulário), sugere a partir do nome e incrementa.
 *
 * Quem decide o conflito é o índice único em lower(email), não uma consulta
 * prévia: entre olhar e inserir cabe outra criação com o mesmo usuário. O
 * `on conflict do nothing` deixa tentar de novo sem abortar a transação.
 */
async function criarConta(
  tx: TransactionSql,
  opts: { nome: string; usuario?: string | undefined; emailContato?: string | undefined },
) {
  const escolhido = opts.usuario ? normalizarUsuario(opts.usuario) : null;
  const base = escolhido ?? usuarioDeNome(opts.nome);
  const tentativas = escolhido ? 1 : 25;
  const senha = gerarSenha();
  const hash = await bcrypt.hash(senha, 10);

  for (let i = 0; i < tentativas; i++) {
    const usuario = i === 0 ? base : `${base}${i + 1}`;
    const meta: Meta = {
      nome: opts.nome.trim(),
      usuario,
      // a senha foi ditada/colada no WhatsApp: vale só até o primeiro acesso
      senha_provisoria: true,
      ...(opts.emailContato ? { email_contato: opts.emailContato } : {}),
    };
    const [conta] = await tx<{ id: string }[]>`
      insert into usuarios (email, raw_user_meta_data, senha_hash, email_confirmed_at)
      values (${emailDeUsuario(usuario)}, ${JSON.stringify(meta)}::jsonb, ${hash}, now())
      on conflict do nothing
      returning id`;
    if (conta) return { id: conta.id, usuario, senha };
    if (escolhido) throw new Recusa(`Já existe alguém com o usuário "${escolhido}". Escolha outro.`);
  }
  throw new Recusa("Não foi possível gerar um usuário livre para esse nome.");
}

export const listarAcessos = acao(async () => {
  await exigirAdmin();
  const [contas, vendedores] = await Promise.all([
    sql<{ id: string; email: string | null; meta: Meta | null; created_at: string; admin: boolean }[]>`
      select u.id, u.email, u.raw_user_meta_data as meta, u.created_at,
             exists (select 1 from user_roles r where r.user_id = u.id and r.role = 'admin') as admin
        from usuarios u order by u.created_at`,
    sql<Vendedor[]>`
      select id, nome, slug, whatsapp, ativo, user_id, created_at from vendedores order by nome`,
  ]);
  const porUsuario = new Map(
    vendedores.flatMap((v) => (v.user_id ? [[v.user_id, v] as const] : [])),
  );

  const linhas = contas.map((u) => {
    const meta = u.meta ?? {};
    const vendedor = porUsuario.get(u.id) ?? null;
    return {
      usuarioId: u.id as string | null,
      usuario: (meta["usuario"] as string) ?? usuarioDeEmail(u.email ?? ""),
      nome: vendedor?.nome ?? (meta["nome"] as string) ?? "",
      emailContato: (meta["email_contato"] as string) ?? "",
      criadoEm: u.created_at as string | null,
      admin: u.admin,
      vendedor: vendedor as Vendedor | null,
    };
  });

  // Inclui vendedores sem user_id: sem isso um vendedor órfão sumiria da
  // administração e não haveria por onde devolver o acesso dele.
  const semAcesso = vendedores
    .filter((v) => !v.user_id)
    .map((v) => ({
      usuarioId: null as string | null,
      usuario: "",
      nome: v.nome,
      emailContato: "",
      criadoEm: v.created_at as string | null,
      admin: false,
      vendedor: v as Vendedor | null,
    }));

  return [...linhas, ...semAcesso];
});

const novoAcesso = z.object({
  tipo: z.enum(["vendedor", "admin"]),
  nome: z.string().min(2, "Informe o nome."),
  usuario: z
    .string()
    .min(USUARIO_MIN, `O usuário precisa de ao menos ${USUARIO_MIN} caracteres.`)
    .max(USUARIO_MAX, `O usuário passa de ${USUARIO_MAX} caracteres.`)
    .regex(USUARIO_REGEX, "Use apenas letras, números e ponto — por exemplo, primeiro.ultimo."),
  email: z.string().email("E-mail inválido.").optional().or(z.literal("")),
  whatsapp: z.string().optional().or(z.literal("")),
});

export const criarAcesso = acao(async (entrada: z.input<typeof novoAcesso>) => {
  await exigirAdmin();
  const data = novoAcesso.parse(entrada);
  const tel = somenteDigitos(data.whatsapp ?? "");
  if (data.tipo === "vendedor" && tel.length < 10)
    throw new Recusa("Informe o WhatsApp do vendedor, com DDD.");

  // Transação: vendedor que falha não deixa login solto para trás.
  return sql.begin(async (tx) => {
    const conta = await criarConta(tx, {
      nome: data.nome,
      usuario: data.usuario,
      emailContato: data.email || undefined,
    });
    await tx`
      insert into user_roles (user_id, role) values (${conta.id}, ${data.tipo})
      on conflict (user_id, role) do nothing`;
    if (data.tipo === "vendedor") {
      const slug = `${slugify(data.nome)}-${sortear(ALFABETO_SENHA, 4).join("")}`;
      await tx`
        insert into vendedores (nome, slug, whatsapp, user_id)
        values (${data.nome.trim()}, ${slug}, ${tel}, ${conta.id})`;
    }
    return { nome: data.nome.trim(), usuario: conta.usuario, senha: conta.senha };
  });
});

/** Devolve acesso a um vendedor que ficou sem user_id (cadastro antigo). */
export const criarAcessoVendedor = acao(async (vendedorId: string) => {
  await exigirAdmin();
  const id = z.string().uuid().parse(vendedorId);
  return sql.begin(async (tx) => {
    const [vendedor] = await tx<{ nome: string; user_id: string | null }[]>`
      select nome, user_id from vendedores where id = ${id} for update`;
    if (!vendedor) throw new Recusa("Vendedor não encontrado.");
    if (vendedor.user_id) throw new Recusa("Esse vendedor já tem acesso ao sistema.");
    const conta = await criarConta(tx, { nome: vendedor.nome });
    await tx`
      insert into user_roles (user_id, role) values (${conta.id}, 'vendedor')
      on conflict (user_id, role) do nothing`;
    await tx`update vendedores set user_id = ${conta.id} where id = ${id}`;
    return { nome: vendedor.nome, usuario: conta.usuario, senha: conta.senha };
  });
});

export const resetarSenha = acao(async (usuarioId: string) => {
  await exigirAdmin();
  const id = z.string().uuid().parse(usuarioId);
  const senha = gerarSenha();
  // Volta a ser provisória: o admin viu essa senha e ela passou pelo WhatsApp.
  const [conta] = await sql<{ email: string | null; meta: Meta | null }[]>`
    update usuarios
       set senha_hash = ${await bcrypt.hash(senha, 10)},
           raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"senha_provisoria": true}'::jsonb,
           updated_at = now()
     where id = ${id}
    returning email, raw_user_meta_data as meta`;
  if (!conta) throw new Recusa("Usuário não encontrado.");
  const meta = conta.meta ?? {};
  return {
    nome: (meta["nome"] as string) ?? "",
    usuario: (meta["usuario"] as string) ?? usuarioDeEmail(conta.email ?? ""),
    senha,
  };
});

const alvo = z.object({
  vendedorId: z.string().uuid().optional(),
  usuarioId: z.string().uuid().optional(),
});

export const excluirAcesso = acao(async (entrada: z.input<typeof alvo>) => {
  const s = await exigirAdmin();
  const data = alvo.parse(entrada);
  if (data.usuarioId && data.usuarioId === s.sub)
    throw new Recusa("Você não pode excluir a sua própria conta.");

  // Vendedor: o cadastro e o login saem juntos, nunca só a metade.
  if (data.vendedorId) {
    const vendedorId = data.vendedorId;
    return sql.begin(async (tx) => {
      const [vendedor] = await tx<{ user_id: string | null }[]>`
        select user_id from vendedores where id = ${vendedorId}`;
      if (vendedor?.user_id === s.sub) throw new Recusa("Você não pode excluir a sua própria conta.");
      await tx`delete from vendedores where id = ${vendedorId}`;
      if (vendedor?.user_id) await tx`delete from usuarios where id = ${vendedor.user_id}`;
      return { ok: true as const };
    });
  }

  if (!data.usuarioId) throw new Recusa("Nada para excluir.");
  // user_roles sai junto pelo ON DELETE CASCADE.
  await sql`delete from usuarios where id = ${data.usuarioId}`;
  return { ok: true as const };
});

const edicao = z.object({
  usuarioId: z.string().uuid().optional(),
  vendedorId: z.string().uuid().optional(),
  nome: z.string().min(2, "Informe o nome."),
  email: z.string().email("E-mail inválido.").optional().or(z.literal("")),
  whatsapp: z.string().optional().or(z.literal("")),
});

/**
 * Edita nome, e-mail de contato e WhatsApp. O `usuario` fica de fora de propósito:
 * é o login, e trocá-lo derrubaria o acesso de quem já recebeu a senha. O `slug`
 * do vendedor também não muda — ele está em links de catálogo já enviados a clientes.
 */
export const atualizarAcesso = acao(async (entrada: z.input<typeof edicao>) => {
  await exigirAdmin();
  const data = edicao.parse(entrada);
  if (!data.usuarioId && !data.vendedorId) throw new Recusa("Nada para editar.");
  const nome = data.nome.trim();
  const tel = somenteDigitos(data.whatsapp ?? "");
  if (tel && tel.length < 10) throw new Recusa("Informe o WhatsApp com DDD.");

  if (data.usuarioId) {
    // Merge, como o GoTrue fazia: `usuario` sobrevive; e-mail vazio vira null.
    const patch = { nome, email_contato: data.email ? data.email.trim() : null };
    await sql`
      update usuarios
         set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb,
             updated_at = now()
       where id = ${data.usuarioId}`;
  }
  if (data.vendedorId) {
    // WhatsApp em branco mantém o atual.
    await sql`
      update vendedores set nome = ${nome}, whatsapp = coalesce(${tel || null}, whatsapp)
       where id = ${data.vendedorId}`;
  }
  return { ok: true as const };
});
```

- [ ] **Step 2: Tela de usuários**

`git mv src/routes/_authenticated/admin.usuarios.tsx 'src/app/(app)/admin/usuarios/page.tsx'`:
1. `"use client";`; tirar `createFileRoute` e `useServerFn`; o import de `@/lib/acessos.functions` passa a ser de `@/server/acessos`; acrescentar `import { chamar } from "@/lib/chamar";`.
2. Apagar o bloco `Route` e as seis linhas `const xFn = useServerFn(...)`.
3. `export default function UsuariosPage()`.
4. Chamadas:
   - `useQuery({ queryKey: CHAVE, queryFn: () => chamar(listarAcessos()) })`
   - `criar`: `mutationFn: () => chamar(criarAcesso({ tipo, nome, usuario, email: email.trim(), whatsapp })),`
   - `darAcesso`: `mutationFn: (vendedorId: string) => chamar(criarAcessoVendedor(vendedorId)),`
   - `resetar`: `mutationFn: (usuarioId: string) => chamar(resetarSenha(usuarioId)),`
   - `salvarEdicao`: `mutationFn: (e: EmEdicao) => chamar(atualizarAcesso({ ...(e.usuarioId ? { usuarioId: e.usuarioId } : {}), ...(e.vendedorId ? { vendedorId: e.vendedorId } : {}), nome: e.nome, email: e.email.trim(), whatsapp: e.whatsapp })),`
   - `remover`: `mutationFn: (v: { vendedorId?: string; usuarioId?: string }) => chamar(excluirAcesso(v)),`

`git rm src/lib/acessos.functions.ts` e tirar a linha dele do `exclude` do `tsconfig.json`.

- [ ] **Step 3: Verificar**

Run: `bun run typecheck`, `bun test`, `bun run build` → ok.
Fumaça como `teste.admin` (PEDIR OK — cria e apaga uma conta no dbprod):
- Lista mostra os 10 usuários reais + os de teste, com papel e vendedor certos.
- Criar vendedor "Teste Acesso Dois" com usuário `teste.dois` → diálogo com usuário e senha; criar de novo com `teste.dois` → "Já existe alguém com o usuário…".
- Em outra aba anônima: entrar com `teste.dois` → cai em `/definir-senha`; senha `12345678` é recusada; senha forte → `/vendedor`.
- Resetar a senha dele → nova senha provisória; editar nome e WhatsApp; excluir → some da lista (e o login dele deixa de funcionar).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: gestao de usuarios sobre crm.usuarios"
```

---

### Task 10: Limpeza e verificação final

**Files:**
- Delete: `src/routes/` (o que restar), `src/integrations/`, `supabase/`
- Modify: `package.json` (tirar `@supabase/supabase-js`), `tsconfig.json` (tirar exclusões de transição), `README.md`, `AGENTS.md`, `roadmap.md`, `src/lib/acessos.ts` (comentários que citam Supabase)

- [ ] **Step 1: Tirar o Supabase**

```bash
git rm -r src/integrations supabase
git rm -r src/routes   # deve estar vazio a esta altura; se não estiver, parar e ver o que ficou
bun remove @supabase/supabase-js
```

No `tsconfig.json`, o `exclude` volta a ser só `["node_modules", "src/**/*.test.ts"]` (com o comentário do bun test).

Run: `grep -rn "supabase\|tanstack/react-router\|tanstack/react-start" src` → só comentários. Reescrever os que ficaram falsos, por exemplo em `src/lib/acessos.ts`: "O Supabase só autentica por e-mail" → "O login é por e-mail no banco"; "Piso do Supabase é 6" → "Piso histórico de 6 caracteres"; "Sem rate limit no login do Supabase" → "O freio de tentativas é por usuário+IP; senha previsível ainda é o furo de verdade".

- [ ] **Step 2: Docs**

`README.md`:

````markdown
# Catálogo Grupo Norte

Catálogo de produtos por distribuidora. O vendedor envia ao cliente um link próprio;
o cliente escolhe os itens e conclui o pedido, que chega pronto no WhatsApp do vendedor.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind v4 · shadcn/ui · Postgres (schema `crm`, via postgres.js)

## Desenvolvimento

```sh
bun install
bun run dev        # http://localhost:8080
bun test           # helpers + integração com o banco (só leitura; pula sem PGHOST)
bun run typecheck
bun run build && bun run start
```

## Variáveis de ambiente

Copie `.env.example` para `.env` — ele **não** vai para o Git. `PG*` apontam para o
Postgres da empresa; `SESSION_SECRET` assina o cookie de login (trocar derruba todas as
sessões). Servindo por HTTP puro em produção (sem HTTPS), defina `COOKIE_INSEGURO=1`,
senão o navegador descarta o cookie e o login falha calado.

## Banco

Tabelas e dados vivem no schema `crm`. Mudança de schema é um arquivo novo em
`db/migrations/`, aplicado com:

```sh
bun scripts/aplicar-sql.ts db/migrations/<arquivo>.sql
```

## Login

Usuários ficam em `crm.usuarios` (senha bcrypt em `senha_hash`), papéis em
`crm.user_roles`. Quem cria acesso é o admin, na tela Usuários. Toda Server Action em
`src/server/` confere a sessão e o papel antes de tocar no banco.
````

`AGENTS.md`:

```markdown
# Notas para agentes

Projeto Next.js 16 + Postgres (schema `crm`, SQL direto via postgres.js). Veja README.md.
```

`roadmap.md`: acrescentar `- [x] Migração para Next.js com backend próprio e Postgres da empresa (schema crm); login, pedidos e imagens fora do Supabase`.

- [ ] **Step 3: Verificação completa**

Run: `bun test` → tudo passa.
Run: `bun run typecheck` → sem erro.
Run: `bun run lint` → sem erro (avisos do react-refresh aceitáveis).
Run: `bun run build` → ok.
Run: `bun run start` e repetir de ponta a ponta com Playwright: login admin → cada tela do menu; login vendedor → `/vendedor` e `/meus-pedidos`; `/c/teste-migracao` → pedido. Console sem erros.

- [ ] **Step 4: PEDIR OK e apagar os dados de teste**

Run: `bun scripts/usuario-teste.ts apagar` → "Usuários, vendedor e pedidos de teste apagados."
Conferir: `select count(*) from crm.usuarios` → 10.

- [ ] **Step 5: Pedidos que o Supabase recebeu depois da cópia (spec, Virada §3)**

O app antigo continua no ar até o link ser trocado; pedido que entrou lá depois da cópia dos dados não está no `crm`.

```bash
bun -e 'import postgres from "postgres"; const crm = postgres({ connection: { search_path: "crm" }, max: 1 }); const sb = postgres(process.env.SUPABASE_DB_URL, { ssl: "require", max: 1, prepare: false }); const [{ ultimo }] = await crm`select max(created_at) as ultimo from pedidos`; const [{ n }] = await sb`select count(*)::int as n from public.pedidos where created_at > ${ultimo}`; console.log(`Último pedido no crm: ${ultimo}. Pedidos no Supabase depois disso: ${n}`); await crm.end(); await sb.end();'
```

Relatar o número ao usuário. Se for maior que zero, a cópia desses pedidos (e itens) é decisão dele, antes de apontar o domínio para o Next.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove Supabase e TanStack; docs do novo stack"
```
