# Login por distribuidora — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada distribuidora (Abastex, DunoPro...) enxerga só os próprios usuários, vendedores, catálogos e pedidos; o papel TI entra em qualquer uma e é o único que cadastra distribuidoras.

**Architecture:** Uma tabela nova, `crm.catalogos`, separa o catálogo (de uma dona, com marca opcional) da distribuidora (`crm.distribuidoras`, que passa a guardar só distribuidoras). A migração 009 move os 10 catálogos de hoje para `catalogos` com o mesmo id, numa transação só, com cópia de segurança e conferência. A sessão passa a carregar `papel` e `dist`; `exigirLogin` confere papel e distribuidora no banco a cada ação, e toda consulta de admin filtra pela distribuidora em uso.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, postgres.js (SQL direto, schema `crm`), Postgres 14, jose (JWT), zod, TanStack Query, bun test.

**Spec:** `docs/superpowers/specs/2026-09-29-login-por-distribuidora-design.md`

## Global Constraints

- **Git é do usuário:** nenhum passo roda `git add`, `git commit`, `git push` nem troca de branch. Onde o fluxo padrão teria "Commit", o passo é "Parar: o usuário revisa e commita".
- **Banco compartilhado:** o dev (`bun run dev`) e a produção usam o mesmo `dbprod`. A 009 só é aplicada na Task 12, junto com o deploy do usuário. Até lá, o código novo só é conferido com `bun run typecheck`, `bun run lint` e `bun test`.
- **Não perder dados:** nada de hoje é apagado sem estar copiado em `crm_backup_20260929` e em `catalogos`; a 009 aborta inteira se a conferência não bater.
- Papéis: `ti` | `admin` | `vendedor`. TI só pelo banco; na tela de Usuários só admin e vendedor.
- Um catálogo de marca por marca em cada dona; o de marca lê nome, cor e logo da marca.
- Catálogo no ar = `catalogos.ativo` e dona ativa e (sem marca ou marca ativa).
- Textos de recusa (exatos): "Sua distribuidora está desativada. Fale com o TI." · "Seu acesso não está ligado a uma distribuidora. Fale com o TI." · "Apenas o TI pode fazer isso." · "Escolha uma distribuidora para continuar." · "Catálogo não encontrado."
- Slug do catálogo: único dentro de cada dona; os links `/c/<vendedor>/<slug>` já enviados continuam valendo.
- Design system Abastex: tokens de `src/abastex.css`, componentes de `src/components/abastex.tsx`; hex solto só para cor de distribuidora (dado).

## Review Focus

1. **Sessão de antes da virada:** cookie sem `papel` tem que mandar para o login, não quebrar telas — teste "token sem papel é recusado" (Task 3).
2. **TI com a distribuidora escolhida desligada:** volta a escolher, não fica trancado fora — conferido na fumaça da Task 12 (desligar e religar a DunoPro com o TI dentro dela).
3. **Id de outra distribuidora numa action:** catálogo, seção, usuário ou vendedor de outra dona recusa ou não faz nada — `exigirCatalogo`/`exigirSecao` (Task 6) e filtros por `distribuidora_id` (Task 8), conferidos na fumaça com o admin de teste da DunoPro (Task 12).
4. **Link público com slug que só existe em outra dona:** "Link não encontrado", nunca o catálogo da outra — fumaça da Task 12 (`/c/teste-dunopro/dunorte`).
5. **Pedido enviado de uma página aberta depois que o catálogo saiu do ar:** recusa com "Este catálogo não está mais disponível. Peça um novo link ao vendedor." (Task 10), conferido na fumaça da Task 12.

---

## Estrutura de arquivos

| Arquivo | Papel |
|---|---|
| `scripts/aplicar-sql.ts` | Ganha `--ensaio` e vários arquivos. |
| `db/migrations/008_papel_ti.sql` (novo) | Valor `ti` no enum. |
| `db/migrations/009_login_por_distribuidora.sql` (novo) | A migração principal. |
| `db/restaurar-backup-20260929.sql` (novo) | Volta atrás da 009. |
| `src/lib/sessao-token.ts` (+ teste) | Sessão com `papel` e `dist`; `areaDe`. |
| `src/server/sessao.ts` | `acessoDe`, `exigirLogin`, `exigirAdmin`, `exigirTI`. |
| `src/server/auth.ts` | `entrar`, `definirSenha`, `distribuidorasParaEscolher`, `escolherDistribuidora`. |
| `src/app/escolher-distribuidora/*` (novo) | Tela do TI. |
| `src/components/app-shell.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/admin/layout.tsx`, `src/app/auth/page.tsx`, `src/app/definir-senha/page.tsx`, `src/proxy.ts` | Papel e distribuidora na navegação. |
| `src/server/db.ts` | `camposCatalogo()`, `catalogoNoAr()`. |
| `src/server/catalogos.ts` | Distribuidoras (TI) e catálogos (por dona). |
| `src/app/(app)/admin/distribuidoras/page.tsx`, `src/app/(app)/admin/catalogo/page.tsx` | Telas. |
| `src/server/pedidos.ts`, `src/server/acessos.ts`, `src/server/publico.ts` | Filtro por distribuidora. |
| `src/hooks/use-catalogos-publicos.ts`, `src/app/(app)/vendedor/page.tsx`, `src/app/c/[slug]/escolher-catalogo.tsx`, `src/app/c/[slug]/[distribuidora]/catalogo.tsx` | Público por vendedor. |
| `scripts/usuario-teste.ts` | Usuários de fumaça por distribuidora. |
| `README.md`, `scripts/sincronizar-supabase*.ts` (apagar), `src/server/db.test.ts` | Documentação, limpeza, teste pós-virada. |

---

### Task 1: `aplicar-sql --ensaio` e migração 008

**Files:**
- Modify: `scripts/aplicar-sql.ts` (arquivo inteiro)
- Create: `db/migrations/008_papel_ti.sql`

**Interfaces:**
- Produces: `bun scripts/aplicar-sql.ts [--ensaio] <arquivo.sql>...` — com `--ensaio`, roda todos os arquivos numa transação e desfaz no fim.

- [ ] **Step 1: Reescrever `scripts/aplicar-sql.ts`**

```ts
// Aplica arquivos .sql no banco do .env, um por vez (cada um é uma transação).
// Roda com: bun scripts/aplicar-sql.ts <arquivo>...
// --ensaio: roda todos numa transação só e desfaz no fim. Mostra se passam com os
// dados reais sem mudar nada (NOTICEs da conferência aparecem no console).
import { readFile } from "node:fs/promises";

import postgres from "postgres";

const args = process.argv.slice(2);
const ensaio = args.includes("--ensaio");
const arquivos = args.filter((a) => a !== "--ensaio");
if (arquivos.length === 0)
  throw new Error("Uso: bun scripts/aplicar-sql.ts [--ensaio] <arquivo.sql>...");

class Desfazer extends Error {}

const sql = postgres({ max: 1 });
try {
  if (ensaio) {
    await sql
      .begin(async (tx) => {
        for (const a of arquivos) {
          await tx.unsafe(await readFile(a, "utf8"));
          console.log(`Ensaiado: ${a}`);
        }
        throw new Desfazer();
      })
      .catch((e) => {
        if (!(e instanceof Desfazer)) throw e;
      });
    console.log("Ensaio desfeito: nada mudou no banco.");
  } else {
    for (const a of arquivos) {
      await sql.unsafe(await readFile(a, "utf8"));
      console.log(`Aplicado: ${a}`);
    }
  }
} finally {
  await sql.end();
}
```

- [ ] **Step 2: Criar `db/migrations/008_papel_ti.sql`**

```sql
-- Papel TI: entra em qualquer distribuidora e é o único com a tela Distribuidoras.
-- Aplicar com: bun scripts/aplicar-sql.ts <este arquivo>
--
-- Fica fora da 009: o Postgres não deixa usar um valor novo de enum na mesma
-- transação que o criou. O código de hoje não usa 'ti', então pode rodar antes.

ALTER TYPE crm.app_role ADD VALUE IF NOT EXISTS 'ti';
```

- [ ] **Step 3: Conferir o ensaio com um SQL que sabidamente falha**

Run: `printf "select 1;\nselect 1/0;\n" > "$TMP/falha.sql" && bun scripts/aplicar-sql.ts --ensaio "$TMP/falha.sql"`
Expected: erro `division by zero` (o ensaio propaga erro de verdade, não engole).

- [ ] **Step 4: Aplicar a 008 (aditiva, o código de hoje ignora)**

Run: `bun scripts/aplicar-sql.ts db/migrations/008_papel_ti.sql`
Expected: `Aplicado: db/migrations/008_papel_ti.sql`. Conferir: `select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'app_role'` lista `admin, vendedor, ti`.

- [ ] **Step 5: Parar: o usuário revisa e commita.**

---

### Task 2: Migração 009 e volta atrás, ensaiadas

**Files:**
- Create: `db/migrations/009_login_por_distribuidora.sql`
- Create: `db/restaurar-backup-20260929.sql`

**Interfaces:**
- Produces (schema depois da 009): `crm.catalogos(id, distribuidora_id, marca_id, slug, nome, cor, emoji, imagem_url, ativo, created_at, updated_at)`; `catalogo_secoes.catalogo_id`; `distribuidora_produtos.catalogo_id` com único `(catalogo_id, produto_id)`; `pedidos.catalogo_id` e `pedidos.distribuidora_id not null`; `usuarios.distribuidora_id`; `vendedores.distribuidora_id not null` → `distribuidoras`.

- [ ] **Step 1: Criar `db/migrations/009_login_por_distribuidora.sql`**

```sql
-- Login por distribuidora (docs/superpowers/specs/2026-09-29-login-por-distribuidora-design.md).
-- Até aqui uma linha de distribuidoras era a marca E o catálogo da Abastex; agora o
-- catálogo mora em crm.catalogos (dona + marca opcional) e distribuidoras guarda só
-- distribuidoras. Tudo o que existe passa a ser da Abastex; eduardo.oliveira vira TI.
--
-- Precisa da 008 aplicada. Aplicar com: bun scripts/aplicar-sql.ts <este arquivo>
-- Ensaiar (desfaz no fim): bun scripts/aplicar-sql.ts --ensaio <este arquivo>
-- Voltar atrás: db/restaurar-backup-20260929.sql
-- Um arquivo = uma transação: se qualquer conferência falhar, nada muda.

-- 1. Ninguém escreve nessas tabelas até o fim.
LOCK TABLE crm.distribuidoras, crm.distribuidora_produtos, crm.catalogo_secoes, crm.pedidos,
  crm.pedido_itens, crm.vendedores, crm.usuarios, crm.user_roles IN ACCESS EXCLUSIVE MODE;

-- 2. Cópia de segurança do momento exato da virada.
CREATE SCHEMA crm_backup_20260929;
CREATE TABLE crm_backup_20260929.distribuidoras AS SELECT * FROM crm.distribuidoras;
CREATE TABLE crm_backup_20260929.distribuidora_produtos AS SELECT * FROM crm.distribuidora_produtos;
CREATE TABLE crm_backup_20260929.catalogo_secoes AS SELECT * FROM crm.catalogo_secoes;
CREATE TABLE crm_backup_20260929.pedidos AS SELECT * FROM crm.pedidos;
CREATE TABLE crm_backup_20260929.pedido_itens AS SELECT * FROM crm.pedido_itens;
CREATE TABLE crm_backup_20260929.vendedores AS SELECT * FROM crm.vendedores;
CREATE TABLE crm_backup_20260929.usuarios AS SELECT * FROM crm.usuarios;
CREATE TABLE crm_backup_20260929.user_roles AS SELECT * FROM crm.user_roles;

-- 3 e 4. Pré-condições: Abastex e eduardo.oliveira existem; só catálogo conhecido tem dado.
DO $$
DECLARE estranhas text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM crm.distribuidoras WHERE slug = 'abastex') THEN
    RAISE EXCEPTION 'Distribuidora abastex não encontrada: cadastre na tela Distribuidoras antes.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM crm.usuarios
                  WHERE lower(email) = 'eduardo.oliveira@acesso.gruponorte.com.br') THEN
    RAISE EXCEPTION 'Usuário eduardo.oliveira não encontrado.';
  END IF;
  SELECT string_agg(d.nome, ', ') INTO estranhas
    FROM crm.distribuidoras d
   WHERE NOT (d.personalizado OR d.slug IN ('dunorte', 'elonorte', 'gruponorte', 'metanorte',
                                            'mixnorte', 'rotanorte', 'supergiro'))
     AND (EXISTS (SELECT 1 FROM crm.distribuidora_produtos x WHERE x.distribuidora_id = d.id)
       OR EXISTS (SELECT 1 FROM crm.catalogo_secoes x WHERE x.distribuidora_id = d.id)
       OR EXISTS (SELECT 1 FROM crm.pedidos x WHERE x.distribuidora_id = d.id));
  IF estranhas IS NOT NULL THEN
    RAISE EXCEPTION 'Estas linhas têm produto, seção ou pedido e não são catálogo conhecido: %', estranhas;
  END IF;
END $$;

-- 5. Catálogos, com o mesmo id da linha que eram.
CREATE TABLE crm.catalogos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distribuidora_id uuid NOT NULL REFERENCES crm.distribuidoras(id) ON DELETE RESTRICT,
  marca_id uuid REFERENCES crm.distribuidoras(id) ON DELETE RESTRICT,
  slug text NOT NULL,
  nome text,
  cor text,
  emoji text,
  imagem_url text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- De marca lê nome e cor da marca; personalizado precisa dos seus.
  CONSTRAINT catalogos_marca_ou_nome CHECK (marca_id IS NOT NULL OR (nome IS NOT NULL AND cor IS NOT NULL)),
  CONSTRAINT catalogos_slug_por_dona UNIQUE (distribuidora_id, slug),
  CONSTRAINT catalogos_marca_por_dona UNIQUE (distribuidora_id, marca_id)
);
CREATE TRIGGER catalogos_updated BEFORE UPDATE ON crm.catalogos
  FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at();

INSERT INTO crm.catalogos (id, distribuidora_id, marca_id, slug, nome, cor, emoji, imagem_url,
                           ativo, created_at, updated_at)
SELECT d.id,
       (SELECT id FROM crm.distribuidoras WHERE slug = 'abastex'),
       CASE WHEN d.personalizado THEN NULL ELSE d.id END,
       d.slug,
       CASE WHEN d.personalizado THEN d.nome END,
       CASE WHEN d.personalizado THEN d.cor END,
       CASE WHEN d.personalizado THEN d.emoji END,
       CASE WHEN d.personalizado THEN d.imagem_url END,
       d.ativo, d.created_at, d.updated_at
  FROM crm.distribuidoras d
 WHERE d.personalizado OR d.slug IN ('dunorte', 'elonorte', 'gruponorte', 'metanorte',
                                     'mixnorte', 'rotanorte', 'supergiro');

-- 6. Seções, vínculos e pedidos passam a apontar para catalogos. Os valores não mudam.
ALTER TABLE crm.catalogo_secoes DROP CONSTRAINT catalogo_secoes_distribuidora_id_fkey;
ALTER TABLE crm.catalogo_secoes RENAME COLUMN distribuidora_id TO catalogo_id;
ALTER TABLE crm.catalogo_secoes
  RENAME CONSTRAINT catalogo_secoes_distribuidora_id_nome_key TO catalogo_secoes_catalogo_id_nome_key;
ALTER TABLE crm.catalogo_secoes ADD CONSTRAINT catalogo_secoes_catalogo_id_fkey
  FOREIGN KEY (catalogo_id) REFERENCES crm.catalogos(id) ON DELETE CASCADE;

ALTER TABLE crm.distribuidora_produtos DROP CONSTRAINT distribuidora_produtos_distribuidora_id_fkey;
ALTER TABLE crm.distribuidora_produtos RENAME COLUMN distribuidora_id TO catalogo_id;
ALTER TABLE crm.distribuidora_produtos RENAME CONSTRAINT
  distribuidora_produtos_distribuidora_id_produto_id_key TO distribuidora_produtos_catalogo_id_produto_id_key;
ALTER INDEX crm.dp_distribuidora_idx RENAME TO dp_catalogo_idx;
ALTER TABLE crm.distribuidora_produtos ADD CONSTRAINT distribuidora_produtos_catalogo_id_fkey
  FOREIGN KEY (catalogo_id) REFERENCES crm.catalogos(id) ON DELETE CASCADE;

ALTER TABLE crm.pedidos DROP CONSTRAINT pedidos_distribuidora_id_fkey;
ALTER TABLE crm.pedidos RENAME COLUMN distribuidora_id TO catalogo_id;
ALTER TABLE crm.pedidos ADD CONSTRAINT pedidos_catalogo_id_fkey
  FOREIGN KEY (catalogo_id) REFERENCES crm.catalogos(id) ON DELETE SET NULL;

-- 7. Dona do pedido: sai do catálogo excluído junto não, fica gravada no pedido.
ALTER TABLE crm.pedidos ADD COLUMN distribuidora_id uuid
  REFERENCES crm.distribuidoras(id) ON DELETE RESTRICT;
UPDATE crm.pedidos SET distribuidora_id = (SELECT id FROM crm.distribuidoras WHERE slug = 'abastex');
ALTER TABLE crm.pedidos ALTER COLUMN distribuidora_id SET NOT NULL;

-- 8. Pessoas.
ALTER TABLE crm.usuarios ADD COLUMN distribuidora_id uuid
  REFERENCES crm.distribuidoras(id) ON DELETE RESTRICT;
UPDATE crm.usuarios SET distribuidora_id = (SELECT id FROM crm.distribuidoras WHERE slug = 'abastex')
 WHERE lower(email) <> 'eduardo.oliveira@acesso.gruponorte.com.br';

ALTER TABLE crm.vendedores DROP CONSTRAINT vendedores_distribuidora_id_fkey;
UPDATE crm.vendedores SET distribuidora_id = (SELECT id FROM crm.distribuidoras WHERE slug = 'abastex');
ALTER TABLE crm.vendedores ALTER COLUMN distribuidora_id SET NOT NULL;
ALTER TABLE crm.vendedores ADD CONSTRAINT vendedores_distribuidora_id_fkey
  FOREIGN KEY (distribuidora_id) REFERENCES crm.distribuidoras(id) ON DELETE RESTRICT;

-- 9. eduardo.oliveira: TI, sem distribuidora (o TI já faz tudo que o admin faz).
INSERT INTO crm.user_roles (user_id, role)
SELECT id, 'ti' FROM crm.usuarios WHERE lower(email) = 'eduardo.oliveira@acesso.gruponorte.com.br'
ON CONFLICT (user_id, role) DO NOTHING;
DELETE FROM crm.user_roles
 WHERE role = 'admin'
   AND user_id = (SELECT id FROM crm.usuarios
                   WHERE lower(email) = 'eduardo.oliveira@acesso.gruponorte.com.br');

-- 10. Só agora, com as FKs trocadas: os personalizados saem de distribuidoras. Antes da
-- troca, o ON DELETE CASCADE levaria produtos e seções junto.
DELETE FROM crm.distribuidoras WHERE personalizado;

-- 11. Conferência contra a cópia: qualquer diferença desfaz tudo.
DO $$
DECLARE
  n_cat int; n_esperado int; n_vinc int; n_sec int; n_ped int; n_itens int; n_vend int; n_usu int;
BEGIN
  SELECT count(*) INTO n_vinc FROM crm.distribuidora_produtos;
  IF n_vinc <> (SELECT count(*) FROM crm_backup_20260929.distribuidora_produtos) THEN
    RAISE EXCEPTION 'Vínculos de produto: a contagem mudou.';
  END IF;
  IF EXISTS (SELECT 1 FROM crm.distribuidora_produtos x
               JOIN crm_backup_20260929.distribuidora_produtos b ON b.id = x.id
              WHERE x.catalogo_id <> b.distribuidora_id OR x.produto_id <> b.produto_id
                 OR x.secao_id IS DISTINCT FROM b.secao_id) THEN
    RAISE EXCEPTION 'Vínculos de produto: algum mudou de catálogo, produto ou seção.';
  END IF;

  SELECT count(*) INTO n_sec FROM crm.catalogo_secoes;
  IF n_sec <> (SELECT count(*) FROM crm_backup_20260929.catalogo_secoes) THEN
    RAISE EXCEPTION 'Seções: a contagem mudou.';
  END IF;
  IF EXISTS (SELECT 1 FROM crm.catalogo_secoes x JOIN crm_backup_20260929.catalogo_secoes b ON b.id = x.id
              WHERE x.catalogo_id <> b.distribuidora_id OR x.nome <> b.nome) THEN
    RAISE EXCEPTION 'Seções: alguma mudou de catálogo ou de nome.';
  END IF;

  SELECT count(*) INTO n_ped FROM crm.pedidos;
  IF n_ped <> (SELECT count(*) FROM crm_backup_20260929.pedidos) THEN
    RAISE EXCEPTION 'Pedidos: a contagem mudou.';
  END IF;
  IF EXISTS (SELECT 1 FROM crm.pedidos x JOIN crm_backup_20260929.pedidos b ON b.id = x.id
              WHERE x.catalogo_id IS DISTINCT FROM b.distribuidora_id
                 OR x.vendedor_id IS DISTINCT FROM b.vendedor_id) THEN
    RAISE EXCEPTION 'Pedidos: algum mudou de catálogo ou de vendedor.';
  END IF;

  SELECT count(*) INTO n_itens FROM crm.pedido_itens;
  IF n_itens <> (SELECT count(*) FROM crm_backup_20260929.pedido_itens) THEN
    RAISE EXCEPTION 'Itens de pedido: a contagem mudou.';
  END IF;

  SELECT count(*) INTO n_vend FROM crm.vendedores;
  SELECT count(*) INTO n_usu FROM crm.usuarios;
  IF n_vend <> (SELECT count(*) FROM crm_backup_20260929.vendedores)
     OR n_usu <> (SELECT count(*) FROM crm_backup_20260929.usuarios) THEN
    RAISE EXCEPTION 'Vendedores ou usuários: a contagem mudou.';
  END IF;

  SELECT count(*) INTO n_cat FROM crm.catalogos;
  SELECT count(*) INTO n_esperado FROM crm_backup_20260929.distribuidoras
   WHERE personalizado OR slug IN ('dunorte', 'elonorte', 'gruponorte', 'metanorte',
                                   'mixnorte', 'rotanorte', 'supergiro');
  IF n_cat <> n_esperado THEN
    RAISE EXCEPTION 'Catálogos: % criados, % esperados.', n_cat, n_esperado;
  END IF;

  IF EXISTS (SELECT 1 FROM crm.usuarios u
              WHERE u.distribuidora_id IS NULL
                AND NOT EXISTS (SELECT 1 FROM crm.user_roles r WHERE r.user_id = u.id AND r.role = 'ti')) THEN
    RAISE EXCEPTION 'Há usuário sem distribuidora que não é TI.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM crm.user_roles WHERE role = 'ti') THEN
    RAISE EXCEPTION 'Nenhum usuário ficou com o papel TI.';
  END IF;

  RAISE NOTICE 'Conferido: % catálogos, % vínculos, % seções, % pedidos, % itens, % vendedores, % usuários.',
    n_cat, n_vinc, n_sec, n_ped, n_itens, n_vend, n_usu;
END $$;
```

- [ ] **Step 2: Criar `db/restaurar-backup-20260929.sql`**

```sql
-- Desfaz a 009 (login por distribuidora): volta o crm ao formato de antes, usando a
-- cópia crm_backup_20260929 feita por ela. Só se a virada der errado, junto com a
-- volta do código antigo no deploy:
--   bun scripts/aplicar-sql.ts db/restaurar-backup-20260929.sql
-- Ensaiar junto com a 009 (desfaz tudo no fim):
--   bun scripts/aplicar-sql.ts --ensaio db/migrations/009_login_por_distribuidora.sql db/restaurar-backup-20260929.sql
--
-- Mantém o que entrou depois da virada e cabe no formato antigo (pedidos, vínculos,
-- seções, usuários). Aborta se houver catálogo criado depois da virada: ele não tem
-- linha em distribuidoras e precisa de decisão caso a caso. O valor 'ti' fica no enum
-- (o Postgres não remove valor de enum), sem ninguém com ele.

LOCK TABLE crm.catalogos, crm.distribuidoras, crm.distribuidora_produtos, crm.catalogo_secoes,
  crm.pedidos, crm.vendedores, crm.usuarios, crm.user_roles IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE novos text;
BEGIN
  SELECT string_agg(c.slug, ', ') INTO novos FROM crm.catalogos c
   WHERE NOT EXISTS (SELECT 1 FROM crm_backup_20260929.distribuidoras b WHERE b.id = c.id);
  IF novos IS NOT NULL THEN
    RAISE EXCEPTION 'Catálogos criados depois da virada, sem lugar no formato antigo: %', novos;
  END IF;
END $$;

-- Os personalizados voltam para distribuidoras como estavam na virada.
INSERT INTO crm.distribuidoras
SELECT * FROM crm_backup_20260929.distribuidoras b
 WHERE NOT EXISTS (SELECT 1 FROM crm.distribuidoras d WHERE d.id = b.id);

ALTER TABLE crm.catalogo_secoes DROP CONSTRAINT catalogo_secoes_catalogo_id_fkey;
ALTER TABLE crm.catalogo_secoes RENAME COLUMN catalogo_id TO distribuidora_id;
ALTER TABLE crm.catalogo_secoes
  RENAME CONSTRAINT catalogo_secoes_catalogo_id_nome_key TO catalogo_secoes_distribuidora_id_nome_key;
ALTER TABLE crm.catalogo_secoes ADD CONSTRAINT catalogo_secoes_distribuidora_id_fkey
  FOREIGN KEY (distribuidora_id) REFERENCES crm.distribuidoras(id) ON DELETE CASCADE;

ALTER TABLE crm.distribuidora_produtos DROP CONSTRAINT distribuidora_produtos_catalogo_id_fkey;
ALTER TABLE crm.distribuidora_produtos RENAME COLUMN catalogo_id TO distribuidora_id;
ALTER TABLE crm.distribuidora_produtos RENAME CONSTRAINT
  distribuidora_produtos_catalogo_id_produto_id_key TO distribuidora_produtos_distribuidora_id_produto_id_key;
ALTER INDEX crm.dp_catalogo_idx RENAME TO dp_distribuidora_idx;
ALTER TABLE crm.distribuidora_produtos ADD CONSTRAINT distribuidora_produtos_distribuidora_id_fkey
  FOREIGN KEY (distribuidora_id) REFERENCES crm.distribuidoras(id) ON DELETE CASCADE;

-- A coluna nova (dona) sai antes: o nome distribuidora_id volta para o catálogo.
ALTER TABLE crm.pedidos DROP COLUMN distribuidora_id;
ALTER TABLE crm.pedidos DROP CONSTRAINT pedidos_catalogo_id_fkey;
ALTER TABLE crm.pedidos RENAME COLUMN catalogo_id TO distribuidora_id;
ALTER TABLE crm.pedidos ADD CONSTRAINT pedidos_distribuidora_id_fkey
  FOREIGN KEY (distribuidora_id) REFERENCES crm.distribuidoras(id) ON DELETE SET NULL;

ALTER TABLE crm.usuarios DROP COLUMN distribuidora_id;

ALTER TABLE crm.vendedores DROP CONSTRAINT vendedores_distribuidora_id_fkey;
ALTER TABLE crm.vendedores ALTER COLUMN distribuidora_id DROP NOT NULL;
UPDATE crm.vendedores SET distribuidora_id = NULL;
ALTER TABLE crm.vendedores ADD CONSTRAINT vendedores_distribuidora_id_fkey
  FOREIGN KEY (distribuidora_id) REFERENCES crm.distribuidoras(id) ON DELETE CASCADE;

INSERT INTO crm.user_roles (user_id, role)
SELECT user_id, 'admin' FROM crm.user_roles WHERE role = 'ti'
ON CONFLICT (user_id, role) DO NOTHING;
DELETE FROM crm.user_roles WHERE role = 'ti';

DROP TABLE crm.catalogos;

DO $$
BEGIN
  RAISE NOTICE 'Restaurado: % linhas em distribuidoras, % vínculos, % seções, % pedidos.',
    (SELECT count(*) FROM crm.distribuidoras), (SELECT count(*) FROM crm.distribuidora_produtos),
    (SELECT count(*) FROM crm.catalogo_secoes), (SELECT count(*) FROM crm.pedidos);
END $$;
```

- [ ] **Step 3: Ensaiar a 009 sozinha**

Run: `bun scripts/aplicar-sql.ts --ensaio db/migrations/009_login_por_distribuidora.sql`
Expected: `NOTICE ... Conferido: 10 catálogos, 9683 vínculos, 47 seções, 40 pedidos, 368 itens, 9 vendedores, 11 usuários.` (números do dia; podem ter crescido), `Ensaiado: ...` e `Ensaio desfeito: nada mudou no banco.`

- [ ] **Step 4: Ensaiar a 009 seguida da volta atrás**

Run: `bun scripts/aplicar-sql.ts --ensaio db/migrations/009_login_por_distribuidora.sql db/restaurar-backup-20260929.sql`
Expected: as duas `NOTICE` (Conferido e Restaurado com as mesmas contagens de antes), `Ensaio desfeito`.

O ensaio trava as tabelas por alguns segundos: a produção espera nesse intervalo, não quebra.

- [ ] **Step 5: Conferir que o ensaio não deixou rastro**

Run (MCP `postgres-vexo`, só leitura): `select to_regclass('crm.catalogos') as catalogos, (select count(*) from pg_namespace where nspname = 'crm_backup_20260929') as backup`
Expected: `catalogos: null`, `backup: 0`.

- [ ] **Step 6: Parar: o usuário revisa e commita.**

---

### Task 3: Sessão com papel e distribuidora

**Files:**
- Modify: `src/lib/sessao-token.ts`, `src/lib/sessao-token.test.ts`
- Modify: `src/server/sessao.ts:42-58`
- Modify: `src/server/auth.ts`
- Modify: `src/app/auth/page.tsx`, `src/app/definir-senha/page.tsx`
- Modify: `scripts/usuario-teste.ts`

**Interfaces:**
- Produces:
  - `type Papel = "ti" | "admin" | "vendedor"`; `type Sessao = { sub: string; email: string; papel: Papel; dist: string | null; prov: boolean }` (em `@/lib/sessao-token`)
  - `areaDe(s: Pick<Sessao, "papel" | "dist" | "prov">): string`
  - `acessoDe(usuarioId: string, escolhida: string | null): Promise<{ papel: Papel | null; dist: string | null; ativa: boolean } | null>`
  - `exigirLogin(): Promise<Contexto>` com `Contexto = { sub: string; email: string; papel: Papel; dist: string | null }`
  - `exigirAdmin(): Promise<Contexto & { dist: string }>`; `exigirTI(): Promise<Contexto>`
  - `distribuidorasParaEscolher()` e `escolherDistribuidora(id: string): Promise<string>` (em `@/server/auth`)

- [ ] **Step 1: Escrever os testes novos em `src/lib/sessao-token.test.ts`**

Trocar o `import` e o `SESSAO`, e o payload do teste de token vencido; acrescentar os testes no fim:

```ts
import { areaDe, assinarSessao, cookieSeguro, cookieSeriaDescartado, lerToken } from "./sessao-token";

const SEGREDO = "x".repeat(40);
const SESSAO = {
  sub: "b3d7c1f0-0000-4000-8000-000000000001",
  email: "a@b",
  papel: "admin" as const,
  dist: "d57ec162-19f3-4d5a-9442-6bba5fb30b1e",
  prov: false,
};
```

No teste "token vencido não vale", o payload vira `{ email: "a@b", papel: "admin", dist: null, prov: false }`.

```ts
test("TI sem distribuidora escolhida ida e volta", async () => {
  const ti = { ...SESSAO, papel: "ti" as const, dist: null };
  expect(await lerToken(await assinarSessao(ti, SEGREDO), SEGREDO)).toEqual(ti);
});

test("token de antes da virada (sem papel) é recusado", async () => {
  const antigo = await new SignJWT({ email: "a@b", admin: true, prov: false })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(SESSAO.sub)
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SEGREDO));
  expect(await lerToken(antigo, SEGREDO)).toBeNull();
});

test("areaDe manda cada um para a sua tela", () => {
  expect(areaDe({ papel: "admin", dist: "x", prov: true })).toBe("/definir-senha");
  expect(areaDe({ papel: "ti", dist: null, prov: false })).toBe("/escolher-distribuidora");
  expect(areaDe({ papel: "ti", dist: "x", prov: false })).toBe("/admin");
  expect(areaDe({ papel: "admin", dist: "x", prov: false })).toBe("/admin");
  expect(areaDe({ papel: "vendedor", dist: "x", prov: false })).toBe("/vendedor");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/lib/sessao-token.test.ts`
Expected: FAIL (`areaDe` não existe; `papel` não volta do token).

- [ ] **Step 3: Implementar em `src/lib/sessao-token.ts`**

Trocar o tipo e as duas funções:

```ts
const PAPEIS = ["ti", "admin", "vendedor"] as const;
export type Papel = (typeof PAPEIS)[number];

/** `dist` = distribuidora em uso; nula só no TI que ainda não escolheu. */
export type Sessao = { sub: string; email: string; papel: Papel; dist: string | null; prov: boolean };

export async function assinarSessao(s: Sessao, segredo?: string) {
  return new SignJWT({ email: s.email, papel: s.papel, dist: s.dist, prov: s.prov })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.sub)
    .setIssuedAt()
    .setExpirationTime(`${DURACAO_SESSAO_S}s`)
    .sign(chave(segredo));
}

/** null para token ausente, adulterado, vencido ou de antes do login por distribuidora. */
export async function lerToken(
  token: string | undefined,
  segredo?: string,
): Promise<Sessao | null> {
  const k = chave(segredo);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, k, { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    const papel = payload["papel"];
    // Token sem papel é o de antes da virada: entra de novo.
    if (!PAPEIS.includes(papel as Papel)) return null;
    const dist = payload["dist"];
    return {
      sub: payload.sub,
      email: String(payload["email"] ?? ""),
      papel: papel as Papel,
      dist: typeof dist === "string" ? dist : null,
      prov: payload["prov"] === true,
    };
  } catch {
    return null;
  }
}

/** Para onde vai quem tem sessão: troca de senha, escolha do TI, ou a própria área. */
export function areaDe(s: Pick<Sessao, "papel" | "dist" | "prov">) {
  if (s.prov) return "/definir-senha";
  if (s.papel === "ti" && !s.dist) return "/escolher-distribuidora";
  return s.papel === "vendedor" ? "/vendedor" : "/admin";
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/lib/sessao-token.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 5: Trocar `exigirLogin`/`exigirAdmin` em `src/server/sessao.ts`**

Acrescentar `type Papel` ao import de `@/lib/sessao-token` e trocar as duas funções por:

```ts
type Contexto = { sub: string; email: string; papel: Papel; dist: string | null };

/**
 * Papel e distribuidora da conta, lidos do banco. Papel: TI vale mais que admin,
 * que vale mais que vendedor. A distribuidora do TI é a que ele escolheu (vem do
 * token); a dos outros é a do cadastro. `ativa` diz se ela está ligada.
 */
export async function acessoDe(usuarioId: string, escolhida: string | null) {
  const [a] = await sql<{ papel: Papel | null; dist: string | null; ativa: boolean | null }[]>`
    with u as (
      select u.distribuidora_id,
             case when exists (select 1 from user_roles r where r.user_id = u.id and r.role = 'ti') then 'ti'
                  when exists (select 1 from user_roles r where r.user_id = u.id and r.role = 'admin') then 'admin'
                  when exists (select 1 from user_roles r where r.user_id = u.id and r.role = 'vendedor') then 'vendedor'
             end as papel
        from usuarios u where u.id = ${usuarioId})
    select u.papel, d.id as dist, d.ativo as ativa
      from u left join distribuidoras d
        on d.id = case when u.papel = 'ti' then ${escolhida}::uuid else u.distribuidora_id end`;
  return a ? { papel: a.papel, dist: a.dist, ativa: !!a.ativa } : null;
}

/** Confere no banco a cada chamada: mudar papel, distribuidora ou desligá-la vale na hora. */
export async function exigirLogin(): Promise<Contexto> {
  const s = await lerSessao();
  if (!s) throw new Recusa("Sua sessão expirou. Entre novamente.");
  // Senha provisória trafegou por WhatsApp: nada além da troca de senha.
  if (s.prov) throw new Recusa("Defina sua senha antes de continuar.");
  const a = await acessoDe(s.sub, s.dist);
  if (!a?.papel) throw new Recusa("Sua sessão expirou. Entre novamente.");
  // TI com a distribuidora escolhida desligada volta a escolher, não fica trancado.
  if (a.papel === "ti")
    return { sub: s.sub, email: s.email, papel: a.papel, dist: a.ativa ? a.dist : null };
  if (!a.dist)
    throw new Recusa("Seu acesso não está ligado a uma distribuidora. Fale com o TI.");
  if (!a.ativa) throw new Recusa("Sua distribuidora está desativada. Fale com o TI.");
  return { sub: s.sub, email: s.email, papel: a.papel, dist: a.dist };
}

/** Admin ou TI, sempre dentro de uma distribuidora: é por ela que tudo se filtra. */
export async function exigirAdmin() {
  const s = await exigirLogin();
  if (s.papel === "vendedor") throw new Recusa("Apenas administradores podem fazer isso.");
  if (!s.dist) throw new Recusa("Escolha uma distribuidora para continuar.");
  return { ...s, dist: s.dist };
}

export async function exigirTI() {
  const s = await exigirLogin();
  if (s.papel !== "ti") throw new Recusa("Apenas o TI pode fazer isso.");
  return s;
}
```

- [ ] **Step 6: `src/server/auth.ts`**

Imports: acrescentar `import { z } from "zod";`, `import { areaDe, type Sessao } from "@/lib/sessao-token";` e trocar o import de `@/server/sessao` por `import { acessoDe, apagarSessao, exigirTI, gravarSessao, ipDaRequisicao, lerSessao } from "@/server/sessao";`. Apagar `function areaDe` local e o campo `admin` de `type Conta`. Em `entrar`, a consulta e o fim ficam:

```ts
  const [conta] = await sql<Conta[]>`
    select u.id, u.email, u.senha_hash, u.raw_user_meta_data as meta
      from usuarios u
     where lower(u.email) = ${email}`;
  const confere = await bcrypt.compare(senhaStr, conta?.senha_hash ?? HASH_FALSO);
  if (!conta?.senha_hash || !confere) {
    throw new Recusa("Usuário ou senha incorretos.");
  }

  limparErrosLogin(chaveIp);
  limparErrosLogin(email);
  const acesso = await acessoDe(conta.id, null);
  if (!acesso?.papel) throw new Recusa("Seu acesso está sem papel. Fale com o TI.");
  if (acesso.papel !== "ti") {
    if (!acesso.dist)
      throw new Recusa("Seu acesso não está ligado a uma distribuidora. Fale com o TI.");
    if (!acesso.ativa) throw new Recusa("Sua distribuidora está desativada. Fale com o TI.");
  }
  await sql`update usuarios set last_sign_in_at = now() where id = ${conta.id}`;
  const sessao: Sessao = {
    sub: conta.id,
    email: conta.email,
    papel: acesso.papel,
    // O TI escolhe depois, na tela de escolha.
    dist: acesso.papel === "ti" ? null : acesso.dist,
    prov: senhaEhProvisoria(conta.meta),
  };
  await gravarSessao(sessao);
  return areaDe(sessao);
```

Acrescentar no fim do arquivo:

```ts
/** Distribuidoras em que o TI pode entrar. */
export const distribuidorasParaEscolher = acao(async () => {
  await exigirTI();
  return [
    ...(await sql<{ id: string; nome: string; slug: string; cor: string; logo_url: string | null }[]>`
      select id, nome, slug, cor, logo_url from distribuidoras where ativo order by nome`),
  ];
});

/** O TI entra numa distribuidora: vale para todas as telas até trocar de novo. */
export const escolherDistribuidora = acao(async (id: string) => {
  const s = await exigirTI();
  const dist = z.string().uuid().parse(id);
  const [d] = await sql`select 1 from distribuidoras where id = ${dist} and ativo`;
  if (!d) throw new Recusa("Essa distribuidora não está disponível.");
  // exigirTI já barrou senha provisória: prov é false aqui.
  await gravarSessao({ sub: s.sub, email: s.email, papel: "ti", dist, prov: false });
  return "/admin";
});
```

- [ ] **Step 7: Páginas de login e de senha usam `areaDe`**

`src/app/auth/page.tsx`: `import { areaDe } from "@/lib/sessao-token";` e `if (s) redirect(areaDe(s));`.
`src/app/definir-senha/page.tsx`: `import { areaDe } from "@/lib/sessao-token";` e `if (!s.prov) redirect(areaDe(s));`.

- [ ] **Step 8: `scripts/usuario-teste.ts` cria por distribuidora**

No `criar`, antes do laço, buscar as duas distribuidoras e ligar cada usuário (e o vendedor) à dele; acrescentar um admin na DunoPro. O laço fica:

```ts
    await sql.begin(async (tx: postgres.TransactionSql) => {
      const [abastex] = await tx<{ id: string }[]>`select id from distribuidoras where slug = 'abastex'`;
      const [dunopro] = await tx<{ id: string }[]>`select id from distribuidoras where slug = 'dunopro'`;
      if (!abastex || !dunopro) throw new Error("Cadastre Abastex e DunoPro antes.");
      for (const [email, papel, dist] of [
        [ADMIN, "admin", abastex.id],
        [VENDEDOR, "vendedor", abastex.id],
        [ADMIN_DUNOPRO, "admin", dunopro.id],
      ] as const) {
        // tx.json, não JSON.stringify+::jsonb — ver o comentário em criarConta (src/server/acessos.ts).
        const [u] = await tx<{ id: string }[]>`
          insert into usuarios (email, senha_hash, raw_user_meta_data, email_confirmed_at, distribuidora_id)
          values (${email}, ${hash}, ${tx.json({ nome: `Teste ${papel}`, usuario: email.split("@")[0] })}, now(), ${dist})
          returning id`;
        await tx`insert into user_roles (user_id, role) values (${u!.id}, ${papel})`;
        if (papel === "vendedor")
          await tx`insert into vendedores (nome, slug, whatsapp, user_id, distribuidora_id)
                   values ('Teste Migração', ${SLUG}, '65999999999', ${u!.id}, ${dist})`;
      }
    });
    console.log("Criados teste.admin, teste.vendedor (Abastex) e teste.dunopro (DunoPro).");
```

Com `const ADMIN_DUNOPRO = "teste.dunopro@acesso.gruponorte.com.br";` junto das outras constantes, e no `apagar`: `await tx\`delete from usuarios where email in (${ADMIN}, ${VENDEDOR}, ${ADMIN_DUNOPRO})\`;`. (Só roda depois da 009: a coluna `distribuidora_id` de `usuarios` nasce nela.)

- [ ] **Step 9: Conferir**

Run: `bun test src/lib/sessao-token.test.ts && bun run typecheck`
Expected: testes PASS. O typecheck ainda acusa os usos de `s.admin` e de `exigirAdmin` sem `dist` que as Tasks 4–10 trocam — anotar a lista e seguir.

- [ ] **Step 10: Parar: o usuário revisa e commita.**

---

### Task 4: Navegação por papel e tela de escolha do TI

**Files:**
- Create: `src/app/escolher-distribuidora/page.tsx`, `src/app/escolher-distribuidora/escolher.tsx`
- Modify: `src/proxy.ts` (matcher), `src/app/(app)/layout.tsx`, `src/app/(app)/admin/layout.tsx`, `src/components/app-shell.tsx`

**Interfaces:**
- Consumes: `areaDe`, `Papel` (Task 3); `distribuidorasParaEscolher`, `escolherDistribuidora` (Task 3); `LOGOS` (`@/lib/logos`).
- Produces: `AppShell({ email, papel, distribuidora, children })` com `distribuidora: string | null` (nome).

- [ ] **Step 1: `src/app/escolher-distribuidora/page.tsx`**

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { areaDe } from "@/lib/sessao-token";
import { lerSessao } from "@/server/sessao";
import { Escolher } from "./escolher";

export const metadata: Metadata = { title: "Escolher distribuidora — Abastex", robots: { index: false } };

/** Só o TI escolhe: os outros já têm a distribuidora do cadastro. */
export default async function EscolherDistribuidoraPage() {
  const s = await lerSessao();
  if (!s) redirect("/auth");
  if (s.prov || s.papel !== "ti") redirect(areaDe(s));
  return <Escolher atual={s.dist} />;
}
```

- [ ] **Step 2: `src/app/escolher-distribuidora/escolher.tsx`**

```tsx
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { chamar } from "@/lib/chamar";
import { mensagemErro } from "@/lib/erros";
import { LOGOS } from "@/lib/logos";
import { distribuidorasParaEscolher, escolherDistribuidora } from "@/server/auth";

export function Escolher({ atual }: { atual: string | null }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["distribuidoras-para-escolher"],
    queryFn: () => chamar(distribuidorasParaEscolher()),
  });

  const escolher = useMutation({
    mutationFn: (id: string) => chamar(escolherDistribuidora(id)),
    onSuccess: (destino) => {
      // Tudo em cache era da distribuidora anterior.
      qc.clear();
      router.replace(destino);
      router.refresh();
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-4 py-12">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">TI</p>
        <h1 className="mt-1 text-2xl font-bold text-ink">Em qual distribuidora você vai entrar?</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Dá para trocar depois pelo menu. Usuários, catálogos e pedidos são os dela.
        </p>
      </div>
      {!data ? (
        <Loader2 className="size-6 animate-spin text-ink-subtle" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.map((d) => {
            const logo = LOGOS[d.slug] ?? d.logo_url;
            return (
              <button
                key={d.id}
                type="button"
                disabled={escolher.isPending}
                onClick={() => escolher.mutate(d.id)}
                className="ax-card relative flex h-24 cursor-pointer items-center justify-center p-4 transition hover:shadow-md disabled:opacity-60"
              >
                {logo ? (
                  <img src={logo} alt={d.nome} className="max-h-14 w-auto max-w-full object-contain" />
                ) : (
                  <span className="text-lg font-bold" style={{ color: d.cor }}>
                    {d.nome}
                  </span>
                )}
                {d.id === atual && (
                  <Check className="absolute right-3 top-3 size-4 text-mint-ink" aria-label="Atual" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Proxy protege a tela nova**

`src/proxy.ts`: `matcher: ["/admin/:path*", "/vendedor/:path*", "/meus-pedidos/:path*", "/definir-senha", "/escolher-distribuidora"],`

- [ ] **Step 4: `src/app/(app)/layout.tsx`**

```tsx
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { areaDe } from "@/lib/sessao-token";
import { sql } from "@/server/db";
import { lerSessao } from "@/server/sessao";

export default async function AreaLogada({ children }: { children: ReactNode }) {
  const s = await lerSessao();
  if (!s) redirect("/auth");
  if (s.prov || (s.papel === "ti" && !s.dist)) redirect(areaDe(s));
  // Só o nome, para o menu: a trava de verdade é o exigirLogin de cada action.
  const [d] = await sql<{ nome: string }[]>`select nome from distribuidoras where id = ${s.dist}`;
  return (
    <AppShell email={s.email} papel={s.papel} distribuidora={d?.nome ?? null}>
      {children}
    </AppShell>
  );
}
```

- [ ] **Step 5: `src/app/(app)/admin/layout.tsx`**

```tsx
  const s = await lerSessao();
  if (!s || s.papel === "vendedor") redirect("/vendedor");
  return children;
```

- [ ] **Step 6: `src/components/app-shell.tsx`**

Tipos e menu (trocar `Item`, `MENU_ADMIN` e a assinatura):

```tsx
import type { Papel } from "@/lib/sessao-token";

type Item = { to: string; label: string; icon: typeof Users; exact?: boolean; soTI?: boolean };
```

No item de Distribuidoras: `{ to: "/admin/distribuidoras", label: "Distribuidoras", icon: Warehouse, soTI: true },`.

```tsx
export function AppShell({
  email,
  papel,
  distribuidora,
  children,
}: {
  email: string;
  papel: Papel;
  /** Nome da distribuidora em uso. */
  distribuidora: string | null;
  children: ReactNode;
}) {
```

Trocar `const grupos = admin ? MENU_ADMIN : MENU_VENDEDOR;` por:

```tsx
  const admin = papel !== "vendedor";
  // Distribuidoras é só do TI; grupo que ficar vazio some.
  const grupos = (admin ? MENU_ADMIN : MENU_VENDEDOR)
    .map((g) => ({ ...g, itens: g.itens.filter((i) => !i.soTI || papel === "ti") }))
    .filter((g) => g.itens.length > 0);
```

Logo depois de `<SidebarContent className="gap-5 py-4">`, antes do `grupos.map`, a distribuidora em uso:

```tsx
          {distribuidora && (
            <div className="mx-3 flex items-center justify-between gap-2 rounded-md bg-sidebar-accent px-3 py-2 group-data-[collapsible=icon]:hidden">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sidebar-muted">
                  Distribuidora
                </p>
                <p className="truncate text-[13px] font-semibold text-sidebar-foreground">
                  {distribuidora}
                </p>
              </div>
              {papel === "ti" && (
                <Link
                  href="/escolher-distribuidora"
                  className="shrink-0 text-xs font-semibold text-sidebar-marker hover:underline"
                >
                  Trocar
                </Link>
              )}
            </div>
          )}
```

E o rótulo do rodapé: `{papel === "ti" ? "TI" : admin ? "Administrador" : "Vendedor"}`.

- [ ] **Step 7: Conferir**

Run: `bun run typecheck`
Expected: sem erro em `app-shell.tsx`, layouts e `escolher-distribuidora`; restam só os das Tasks 5–10.

- [ ] **Step 8: Parar: o usuário revisa e commita.**

---

### Task 5: Distribuidoras só do TI

**Files:**
- Modify: `src/server/catalogos.ts` (bloco de distribuidoras, linhas 19–71)
- Modify: `src/app/(app)/admin/distribuidoras/page.tsx`

**Interfaces:**
- Consumes: `exigirTI` (Task 3).
- Produces: `listarDistribuidoras()`, `criarDistribuidora({ nome, cor, logoUrl })`, `ativarDistribuidora(id: string, ativo: boolean)`.

- [ ] **Step 1: Trocar o bloco de distribuidoras em `src/server/catalogos.ts`**

Import: `import { exigirAdmin, exigirTI } from "@/server/sessao";`. O comentário do topo e as três actions ficam:

```ts
// Distribuidora (Abastex, Dunorte...) é o cadastro do TI: quem usa o sistema e as
// marcas. Catálogo é de uma distribuidora (a dona) e, se for de marca, usa nome,
// logo e cor da marca; sem marca, é o personalizado.

/** Cadastro do TI. */
export const listarDistribuidoras = acao(async () => {
  await exigirTI();
  return [
    ...(await sql<
      { id: string; nome: string; slug: string; cor: string; logo_url: string | null; ativo: boolean }[]
    >`select id, nome, slug, cor, logo_url, ativo from distribuidoras order by nome`),
  ];
});
```

`criarDistribuidora`: `await exigirTI();`, insert sem `personalizado`:

```ts
    await sql`
      insert into distribuidoras (nome, slug, cor, logo_url)
      values (${d.nome}, ${slug}, ${d.cor}, ${d.logoUrl})`;
```

e a recusa do 23505 vira `"Já existe uma distribuidora com esse nome."`.

Trocar `ativarCatalogo` (a antiga, que ligava a linha de distribuidoras) por:

```ts
/**
 * Desligada, tira do ar tudo dela: o login dos usuários, os catálogos dela e os
 * catálogos de outras distribuidoras com a marca dela (catalogoNoAr, em db.ts).
 */
export const ativarDistribuidora = acao(async (id: string, ativo: boolean) => {
  await exigirTI();
  await sql`update distribuidoras set ativo = ${ativo} where id = ${z.string().uuid().parse(id)}`;
});
```

- [ ] **Step 2: Tela `src/app/(app)/admin/distribuidoras/page.tsx`**

Import `ativarDistribuidora` no lugar de `ativarCatalogo`; a mutation fica:

```tsx
  const alternar = useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) =>
      chamar(ativarDistribuidora(id, ativo)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-distribuidoras-full"] });
      qc.invalidateQueries({ queryKey: ["catalogos"] });
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });
```

Subtítulo: `"Só o TI vê esta tela. Desligar uma distribuidora tira do ar tudo dela: o acesso dos usuários, os catálogos dela e os de outras distribuidoras com a marca dela."`. Na descrição do diálogo de nova: `"Pode ser quem usa o sistema (ganha usuários pela tela Usuários, com o TI dentro dela) e marca de catálogo para qualquer distribuidora."`

- [ ] **Step 3: Conferir**

Run: `bun run typecheck`
Expected: sem erro na tela de Distribuidoras.

- [ ] **Step 4: Parar: o usuário revisa e commita.**

---

### Task 6: Catálogos por dona (servidor)

**Files:**
- Modify: `src/server/db.ts` (acrescentar no fim)
- Modify: `src/server/catalogos.ts` (do `export type Catalogo` até o fim)

**Interfaces:**
- Produces (em `@/server/db`): `camposCatalogo()` e `catalogoNoAr()` — fragmentos que esperam `catalogos c left join distribuidoras m on m.id = c.marca_id`.
- Produces (em `@/server/catalogos`): `type Catalogo = { id: string; nome: string; slug: string; cor: string; emoji: string | null; imagem_url: string | null; logo_url: string | null; marca_id: string | null; personalizado: boolean; ativo: boolean }`; `listarCatalogos()`, `marcasDisponiveis()`, `criarCatalogoDeMarca(marcaId: string): Promise<{ id: string; nome: string }>`, `ativarCatalogo(id, ativo)`, `salvarCatalogo(editandoId, entrada): Promise<{ id: string; nome: string }>`, `excluirCatalogo(id)` e as de seção/vínculo com as mesmas assinaturas de hoje.

- [ ] **Step 1: Fragmentos em `src/server/db.ts`**

```ts
/**
 * Colunas do catálogo como a tela e o cliente veem: o de marca herda nome, cor e
 * logo da marca. Espera `catalogos c left join distribuidoras m on m.id = c.marca_id`.
 */
export function camposCatalogo() {
  return sql`c.id, c.slug, c.ativo, c.marca_id, c.marca_id is null as personalizado,
    coalesce(m.nome, c.nome) as nome, coalesce(m.cor, c.cor) as cor,
    c.emoji, c.imagem_url, m.logo_url`;
}

/** No ar para o cliente: catálogo ligado, dona ativa e marca (se houver) ativa. Mesmos aliases. */
export function catalogoNoAr() {
  return sql`c.ativo and (m.id is null or m.ativo)
    and exists (select 1 from distribuidoras dona where dona.id = c.distribuidora_id and dona.ativo)`;
}
```

- [ ] **Step 2: Reescrever `src/server/catalogos.ts` do `export type Catalogo` até o fim**

Import: `import { camposCatalogo, condicaoBusca, sql } from "@/server/db";`.

```ts
export type Catalogo = {
  id: string;
  nome: string;
  slug: string;
  cor: string;
  emoji: string | null;
  imagem_url: string | null;
  logo_url: string | null;
  marca_id: string | null;
  personalizado: boolean;
  ativo: boolean;
};
export type Secao = { id: string; nome: string; ordem: number };
type ProdutoResumo = { id: string; codigo: string; nome: string; arquivo: string | null };

/** Recusa catálogo de outra distribuidora: um id colado de fora não passa. */
async function exigirCatalogo(catalogoId: string, dist: string) {
  const [c] = await sql`
    select 1 from catalogos
     where id = ${z.string().uuid().parse(catalogoId)} and distribuidora_id = ${dist}`;
  if (!c) throw new Recusa("Catálogo não encontrado.");
}

/** Seção de destino tem que ser do mesmo catálogo. */
async function exigirSecao(secaoId: string | null, catalogoId: string) {
  if (!secaoId) return;
  const [x] = await sql`
    select 1 from catalogo_secoes
     where id = ${z.string().uuid().parse(secaoId)} and catalogo_id = ${catalogoId}`;
  if (!x) throw new Recusa("Seção não encontrada.");
}

/** Seções só por id (renomear, ordenar, excluir) filtram pela dona no próprio SQL. */
const daDona = (dist: string) =>
  sql`catalogo_id in (select id from catalogos where distribuidora_id = ${dist})`;

export const listarCatalogos = acao(async () => {
  const s = await exigirAdmin();
  return [
    ...(await sql<Catalogo[]>`
      select ${camposCatalogo()}
        from catalogos c left join distribuidoras m on m.id = c.marca_id
       where c.distribuidora_id = ${s.dist}
       order by nome`),
  ];
});

/** Marcas ativas que a distribuidora em uso ainda não tem como catálogo. */
export const marcasDisponiveis = acao(async () => {
  const s = await exigirAdmin();
  return [
    ...(await sql<{ id: string; nome: string; slug: string; cor: string; logo_url: string | null }[]>`
      select d.id, d.nome, d.slug, d.cor, d.logo_url from distribuidoras d
       where d.ativo
         and not exists (select 1 from catalogos c
                          where c.distribuidora_id = ${s.dist} and c.marca_id = d.id)
       order by d.nome`),
  ];
});

/** Catálogo com a marca de uma distribuidora: nome, logo e cor vêm dela; o link é o slug dela. */
export const criarCatalogoDeMarca = acao(async (marcaId: string) => {
  const s = await exigirAdmin();
  const id = z.string().uuid().parse(marcaId);
  const [m] = await sql<{ slug: string; nome: string }[]>`
    select slug, nome from distribuidoras where id = ${id} and ativo`;
  if (!m) throw new Recusa("Distribuidora não encontrada.");
  try {
    const [novo] = await sql<{ id: string }[]>`
      insert into catalogos (distribuidora_id, marca_id, slug)
      values (${s.dist}, ${id}, ${m.slug})
      returning id`;
    return { id: novo!.id, nome: m.nome };
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      throw new Recusa(`Já existe um catálogo ${m.nome}, ou com o mesmo link, nesta distribuidora.`);
    throw e;
  }
});

export const ativarCatalogo = acao(async (id: string, ativo: boolean) => {
  const s = await exigirAdmin();
  await sql`
    update catalogos set ativo = ${ativo}
     where id = ${z.string().uuid().parse(id)} and distribuidora_id = ${s.dist}`;
});

export const secoesDoCatalogo = acao(async (catalogoId: string) => {
  const s = await exigirAdmin();
  await exigirCatalogo(catalogoId, s.dist);
  return [
    ...(await sql<Secao[]>`
      select id, nome, ordem from catalogo_secoes
       where catalogo_id = ${catalogoId} order by ordem, nome`),
  ];
});

/** O catálogo em si: busca e contagem valem sobre o que está nele, não sobre o cadastro. */
export const itensDoCatalogo = acao(
  async (f: { catalogoId: string; secaoId: string; termo: string; pagina: number }) => {
    const s = await exigirAdmin();
    await exigirCatalogo(f.catalogoId, s.dist);
    const onde = () => sql`
      dp.catalogo_id = ${f.catalogoId}
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

/** Cadastro completo, para o modal de adicionar. Produto é compartilhado entre todas. */
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
  const s = await exigirAdmin();
  await exigirCatalogo(catalogoId, s.dist);
  const linhas = await sql<{ produto_id: string; secao_id: string | null }[]>`
    select produto_id, secao_id from distribuidora_produtos
     where catalogo_id = ${catalogoId} and produto_id = any(${sql.array(produtoIds)}::uuid[])`;
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
    insert into distribuidora_produtos (catalogo_id, produto_id, secao_id)
    select ${catalogoId}::uuid, unnest(${sql.array(unicos)}::uuid[]), ${secaoId}::uuid
    on conflict (catalogo_id, produto_id) do update set secao_id = excluded.secao_id`;
  return unicos.length;
}

export const vincular = acao(
  async (catalogoId: string, produtoIds: string[], secaoId: string | null) => {
    const s = await exigirAdmin();
    await exigirCatalogo(catalogoId, s.dist);
    await exigirSecao(secaoId, catalogoId);
    return vincularIds(catalogoId, produtoIds, secaoId);
  },
);

/** "Adicionar N": tudo que a busca do modal devolve, num INSERT só. */
export const vincularBusca = acao(
  async (catalogoId: string, termo: string, secaoId: string | null) => {
    const s = await exigirAdmin();
    await exigirCatalogo(catalogoId, s.dist);
    await exigirSecao(secaoId, catalogoId);
    const r = await sql`
      insert into distribuidora_produtos (catalogo_id, produto_id, secao_id)
      select ${catalogoId}::uuid, p.id, ${secaoId}::uuid from produtos p
       where true ${condicaoBusca(termo)}
      on conflict (catalogo_id, produto_id) do update set secao_id = excluded.secao_id`;
    return r.count;
  },
);

export const desvincular = acao(async (catalogoId: string, produtoIds: string[]) => {
  const s = await exigirAdmin();
  await exigirCatalogo(catalogoId, s.dist);
  const r = await sql`
    delete from distribuidora_produtos
     where catalogo_id = ${catalogoId} and produto_id = any(${sql.array(produtoIds)}::uuid[])`;
  return r.count;
});

/** "Remover N": o que está à vista — a aba aberta também filtra. */
export const desvincularBusca = acao(async (catalogoId: string, secaoId: string, termo: string) => {
  const s = await exigirAdmin();
  await exigirCatalogo(catalogoId, s.dist);
  const r = await sql`
      delete from distribuidora_produtos dp using produtos p
       where p.id = dp.produto_id
         and dp.catalogo_id = ${catalogoId}
         ${secaoId ? sql`and dp.secao_id = ${secaoId}` : sql``}
         ${condicaoBusca(termo)}`;
  return r.count;
});

export const colarCodigos = acao(
  async (catalogoId: string, texto: string, secaoId: string | null) => {
    const s = await exigirAdmin();
    await exigirCatalogo(catalogoId, s.dist);
    await exigirSecao(secaoId, catalogoId);
    const codigos = parseCodigos(texto);
    if (codigos.length === 0) throw new Recusa("Cole ao menos um código.");
    if (codigos.length > MAX_CODIGOS_COLADOS)
      throw new Recusa(
        `Cole no máximo ${MAX_CODIGOS_COLADOS} códigos por vez — vieram ${codigos.length}.`,
      );
    const linhas = await sql<{ id: string; codigo: string; noCatalogo: boolean }[]>`
      select p.id, p.codigo,
             exists (select 1 from distribuidora_produtos dp
                      where dp.produto_id = p.id and dp.catalogo_id = ${catalogoId}) as "noCatalogo"
        from produtos p
       where p.codigo = any(${sql.array(codigos)})
       order by p.created_at`;
    // Colar 100 códigos tem que dar 100 produtos, mesmo com EAN repetido no ERP.
    const { achados, repetidos } = umCadastroPorCodigo(linhas);
    await vincularIds(catalogoId, [...achados.values()], secaoId);
    return { total: achados.size, repetidos, faltando: codigos.filter((c) => !achados.has(c)) };
  },
);
```

`enviarImagem` fica como está. Depois dele:

```ts
const catalogoSchema = z.object({
  nome: z.string().trim().min(1, "Dê um nome ao catálogo."),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida."),
  // [...s] conta por code point, como o char_length do banco: emoji de família
  // passa de 8 unidades UTF-16 sem passar de 8 code points.
  emoji: z
    .string()
    .trim()
    .nullable()
    .refine((s) => s === null || [...s].length <= 8, "Use um emoji só."),
  imagemUrl: z.string().nullable(),
  copiarDe: z.string(),
});

/** Duplica o catálogo de origem: seções nascem de novo e cada vínculo vai para a de mesmo nome. */
async function copiarCatalogo(tx: TransactionSql, origemId: string, destinoId: string) {
  await tx`
    insert into catalogo_secoes (catalogo_id, nome, ordem)
    select ${destinoId}::uuid, nome, ordem from catalogo_secoes where catalogo_id = ${origemId}`;
  await tx`
    insert into distribuidora_produtos (catalogo_id, produto_id, secao_id)
    select ${destinoId}::uuid, dp.produto_id, destino.id
      from distribuidora_produtos dp
      left join catalogo_secoes origem on origem.id = dp.secao_id
      left join catalogo_secoes destino
             on destino.catalogo_id = ${destinoId} and destino.nome = origem.nome
     where dp.catalogo_id = ${origemId}
    on conflict (catalogo_id, produto_id) do nothing`;
}

/** Personalizado: cria ou edita, sempre na distribuidora em uso. */
export const salvarCatalogo = acao(
  async (editandoId: string | null, entrada: z.input<typeof catalogoSchema>) => {
    const s = await exigirAdmin();
    const c = catalogoSchema.parse(entrada);
    if (c.copiarDe) await exigirCatalogo(c.copiarDe, s.dist);
    // Emoji e imagem se excluem: o que não foi escolhido vai nulo.
    const campos = { nome: c.nome, cor: c.cor, emoji: c.emoji || null, imagem_url: c.imagemUrl };
    try {
      if (editandoId) {
        // O slug não muda ao renomear: é ele que está nos links já enviados aos clientes.
        // ponytail: sem <T[]> aqui — com o helper sql(campos, ...) o postgres.js tipa o
        // argumento como array readonly e o TS recusa o await (TS2345).
        const [salvo] = (await sql`
          update catalogos set ${sql(campos, "nome", "cor", "emoji", "imagem_url")}
           where id = ${editandoId} and distribuidora_id = ${s.dist} and marca_id is null
          returning id, nome`) as { id: string; nome: string }[];
        if (!salvo) throw new Recusa("Catálogo não encontrado.");
        return salvo;
      }
      const slug = slugify(c.nome);
      if (!slug) throw new Recusa("Dê um nome ao catálogo.");
      // Transação: se a cópia falhar, o catálogo novo não fica pela metade.
      return await sql.begin(async (tx) => {
        const [novo] = (await tx`
          insert into catalogos ${tx(
            { ...campos, slug, distribuidora_id: s.dist },
            "nome",
            "cor",
            "emoji",
            "imagem_url",
            "slug",
            "distribuidora_id",
          )}
          returning id, nome`) as { id: string; nome: string }[];
        if (c.copiarDe) await copiarCatalogo(tx, c.copiarDe, novo!.id);
        return novo!;
      });
    } catch (e) {
      if ((e as { code?: string }).code === "23505")
        throw new Recusa("Já existe um catálogo com esse link nesta distribuidora. Mude o nome.");
      throw e;
    }
  },
);

export const excluirCatalogo = acao(async (id: string) => {
  const s = await exigirAdmin();
  // Vínculos e seções saem junto (cascade); o pedido fica, com a dona gravada nele.
  await sql`
    delete from catalogos where id = ${z.string().uuid().parse(id)} and distribuidora_id = ${s.dist}`;
});

export const criarSecao = acao(async (catalogoId: string, nome: string) => {
  const s = await exigirAdmin();
  await exigirCatalogo(catalogoId, s.dist);
  const limpo = String(nome ?? "").trim();
  if (!limpo) throw new Recusa("Dê um nome à seção.");
  const [x] = await sql<{ id: string }[]>`
    insert into catalogo_secoes (catalogo_id, nome, ordem)
    values (${catalogoId}, ${limpo},
            (select count(*) from catalogo_secoes where catalogo_id = ${catalogoId}))
    returning id`;
  return x!.id;
});

export const renomearSecao = acao(async (id: string, nome: string) => {
  const s = await exigirAdmin();
  const limpo = String(nome ?? "").trim();
  if (!limpo) throw new Recusa("Dê um nome à seção.");
  await sql`update catalogo_secoes set nome = ${limpo} where id = ${id} and ${daDona(s.dist)}`;
});

/**
 * ponytail: regrava a ordem inteira em vez de trocar duas linhas — são poucas
 * seções, e assim a lista se conserta sozinha se a ordem repetir.
 */
export const ordenarSecoes = acao(async (ids: string[]) => {
  const s = await exigirAdmin();
  await sql.begin((tx) =>
    ids.map(
      (id, ordem) => tx`
        update catalogo_secoes set ordem = ${ordem}
         where id = ${id}
           and catalogo_id in (select id from catalogos where distribuidora_id = ${s.dist})`,
    ),
  );
});

export const excluirSecao = acao(async (id: string) => {
  const s = await exigirAdmin();
  // SET NULL na FK: os produtos da seção continuam no catálogo, sem seção.
  await sql`delete from catalogo_secoes where id = ${id} and ${daDona(s.dist)}`;
});
```

(`ordenarSecoes` escreve o filtro com `tx` em vez de `daDona`: o fragmento de `sql` não entra numa query de `tx`.)

- [ ] **Step 3: Conferir**

Run: `bun run typecheck`
Expected: sem erro em `src/server/catalogos.ts` e `db.ts`; a tela de Catálogos pode acusar o `Catalogo` novo até a Task 7.

- [ ] **Step 4: Parar: o usuário revisa e commita.**

---

### Task 7: Tela de Catálogos

**Files:**
- Modify: `src/app/(app)/admin/catalogo/page.tsx`

**Interfaces:**
- Consumes: `marcasDisponiveis`, `criarCatalogoDeMarca`, `ativarCatalogo`, `excluirCatalogo`, `Catalogo` (Task 6).

- [ ] **Step 1: Imports**

Acrescentar `criarCatalogoDeMarca` e `marcasDisponiveis` ao import de `@/server/catalogos`, e `Warehouse` ao import de `lucide-react`.

- [ ] **Step 2: Estado, consulta e mutation do "de distribuidora"**

Junto dos outros `useState` do formulário:

```tsx
  // Novo catálogo com a marca de uma distribuidora: só escolher qual.
  const [marcaAberta, setMarcaAberta] = useState(false);
  const [marcaId, setMarcaId] = useState("");
```

Depois de `catalogosQuery`:

```tsx
  const marcasQuery = useQuery({
    queryKey: ["catalogo-marcas"],
    enabled: marcaAberta,
    queryFn: () => chamar(marcasDisponiveis()),
  });
```

Junto das outras mutations:

```tsx
  const criarDeMarca = useMutation({
    mutationFn: () => chamar(criarCatalogoDeMarca(marcaId)),
    onSuccess: (novo) => {
      toast.success(`Catálogo ${novo.nome} criado. Agora é só adicionar os produtos.`);
      setMarcaAberta(false);
      qc.invalidateQueries({ queryKey: ["catalogos"] });
      qc.invalidateQueries({ queryKey: ["catalogo-marcas"] });
      qc.invalidateQueries({ queryKey: ["catalogos-publicos"] });
      setCatalogoId(novo.id);
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });
```

- [ ] **Step 3: Cabeçalho**

Subtítulo: `"Os catálogos desta distribuidora: os de marca (Dunorte, Elonorte...) e os personalizados. Cada um vira um link no painel dos vendedores dela."`. Antes do botão "Novo personalizado":

```tsx
            <Button
              variant="outline"
              onClick={() => {
                setMarcaId("");
                setMarcaAberta(true);
              }}
            >
              <Warehouse />
              Novo de distribuidora
            </Button>
```

- [ ] **Step 4: Seletor e ações do catálogo escolhido**

No `SelectLabel` do primeiro grupo: `De distribuidora`. O bloco `{catalogo?.personalizado && (` vira `{catalogo && (`, e o botão Editar fica só para personalizado:

```tsx
            {catalogo.personalizado && (
              <Button
                variant="ghost"
                size="sm"
                disabled={ocupado}
                onClick={() => abrirFormCatalogo(catalogo)}
              >
                <Pencil />
                Editar
              </Button>
            )}
```

Texto do vazio: `"Escolha um catálogo para montá-lo — ou crie um novo."`.

- [ ] **Step 5: Diálogo "Novo de distribuidora"** (antes do diálogo do personalizado)

```tsx
      <Dialog open={marcaAberta} onOpenChange={setMarcaAberta}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo catálogo de distribuidora</DialogTitle>
            <DialogDescription>
              Usa nome, logo e cor da distribuidora escolhida. Os produtos você escolhe depois,
              e são só deste catálogo.
            </DialogDescription>
          </DialogHeader>
          {marcasQuery.data && marcasQuery.data.length === 0 ? (
            <p className="text-sm text-ink-muted">
              Esta distribuidora já tem catálogo de todas as marcas ativas.
            </p>
          ) : (
            <Select value={marcaId} onValueChange={setMarcaId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha a distribuidora" />
              </SelectTrigger>
              <SelectContent>
                {(marcasQuery.data ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="flex items-center gap-2">
                      <i className="size-2.5 shrink-0 rounded-full" style={{ background: m.cor }} />
                      {m.nome}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarcaAberta(false)}>
              Cancelar
            </Button>
            <Button
              variant="accent"
              disabled={!marcaId || criarDeMarca.isPending}
              onClick={() => criarDeMarca.mutate()}
            >
              {criarDeMarca.isPending ? "Criando..." : "Criar catálogo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 6: Conferir**

Run: `bun run typecheck && bunx eslint "src/app/(app)/admin/catalogo/page.tsx"`
Expected: sem erro.

- [ ] **Step 7: Parar: o usuário revisa e commita.**

---

### Task 8: Pedidos, painel e usuários por distribuidora

**Files:**
- Modify: `src/server/pedidos.ts`
- Modify: `src/server/acessos.ts`

**Interfaces:**
- Consumes: `exigirAdmin(): Promise<Contexto & { dist: string }>` (Task 3).

- [ ] **Step 1: `src/server/pedidos.ts`**

`listaPedidos` troca o terceiro parâmetro e os joins:

```ts
/** Mesma forma que o embed do PostgREST devolvia: itens, vendedor e catálogo aninhados. */
async function listaPedidos(
  inicio: string,
  fim: string,
  filtro: { vendedorId: string } | { dist: string },
) {
  const [de, ate] = periodo.parse([inicio, fim]);
  return [
    ...(await sql<PedidoDaLista[]>`
      select p.id, p.cliente_nome, p.observacao, p.total_itens, p.created_at,
             case when v.id is null then null else json_build_object('nome', v.nome) end as vendedores,
             case when c.id is null then null
                  else json_build_object('nome', coalesce(m.nome, c.nome), 'cor', coalesce(m.cor, c.cor))
             end as distribuidoras,
             coalesce((select json_agg(json_build_object('codigo', i.codigo, 'nome', i.nome,
                                                         'quantidade', i.quantidade, 'unidade', i.unidade)
                                       order by i.created_at, i.id)
                         from pedido_itens i where i.pedido_id = p.id), '[]'::json) as pedido_itens
        from pedidos p
        left join vendedores v on v.id = p.vendedor_id
        left join catalogos c on c.id = p.catalogo_id
        left join distribuidoras m on m.id = c.marca_id
       where p.created_at between ${de} and ${ate}
         ${"vendedorId" in filtro
           ? sql`and p.vendedor_id = ${filtro.vendedorId}`
           : sql`and p.distribuidora_id = ${filtro.dist}`}
       order by p.created_at desc`),
  ];
}
```

`meusPedidos`: `return v ? listaPedidos(inicio, fim, { vendedorId: v.id }) : [];`.
`pedidosDoPeriodo`: `const s = await exigirAdmin(); return listaPedidos(inicio, fim, { dist: s.dist });`.
`resumoPainel`: `const s = await exigirAdmin();` e `where p.distribuidora_id = ${s.dist} and p.created_at between ${de} and ${fim}`.
`vendedoresAtivos`: `const s = await exigirAdmin();` e `where ativo and distribuidora_id = ${s.dist}`.

- [ ] **Step 2: `src/server/acessos.ts` — conta nasce na distribuidora**

`criarConta` ganha `distribuidoraId: string` nas `opts` e grava a coluna:

```ts
  opts: {
    nome: string;
    usuario?: string | undefined;
    emailContato?: string | undefined;
    distribuidoraId: string;
  },
```

```ts
    const [conta] = await tx<{ id: string }[]>`
      insert into usuarios (email, raw_user_meta_data, senha_hash, email_confirmed_at, distribuidora_id)
      values (${emailDeUsuario(usuario)}, ${tx.json(meta as unknown as JSONValue)}, ${hash}, now(),
              ${opts.distribuidoraId})
      on conflict do nothing
      returning id`;
```

- [ ] **Step 3: `src/server/acessos.ts` — cada action filtra pela distribuidora**

`listarAcessos`: `const s = await exigirAdmin();`; `from usuarios u where u.distribuidora_id = ${s.dist} order by u.created_at` e `from vendedores where distribuidora_id = ${s.dist} order by nome`.

`criarAcesso`: `const s = await exigirAdmin();`; `criarConta(tx, { nome: data.nome, usuario: data.usuario, emailContato: data.email || undefined, distribuidoraId: s.dist })`; o insert do vendedor:

```ts
      await tx`
        insert into vendedores (nome, slug, whatsapp, user_id, distribuidora_id)
        values (${data.nome.trim()}, ${slug}, ${tel}, ${conta.id}, ${s.dist})`;
```

`criarAcessoVendedor`: `const s = await exigirAdmin();`; `select nome, user_id from vendedores where id = ${id} and distribuidora_id = ${s.dist} for update`; `criarConta(tx, { nome: vendedor.nome, distribuidoraId: s.dist })`.

`resetarSenha`: `const s = await exigirAdmin();` e `where id = ${id} and distribuidora_id = ${s.dist}`.

`excluirAcesso`: vendedor por `select user_id from vendedores where id = ${vendedorId} and distribuidora_id = ${s.dist}` com `if (!vendedor) throw new Recusa("Vendedor não encontrado.");` antes de apagar; usuário por `delete from usuarios where id = ${data.usuarioId} and distribuidora_id = ${s.dist}`.

`atualizarAcesso`: `const s = await exigirAdmin();`; os dois updates ganham `and distribuidora_id = ${s.dist}`.

- [ ] **Step 4: Conferir**

Run: `bun run typecheck`
Expected: sem erro em `pedidos.ts` e `acessos.ts`.

- [ ] **Step 5: Parar: o usuário revisa e commita.**

---

### Task 9: Clientes e produtos seguem compartilhados

**Files:**
- Modify: nenhum.

- [ ] **Step 1: Conferir que `src/server/produtos.ts` e `src/server/clientes.ts` só usam `exigirAdmin()` sem ler `.admin`**

Run: `grep -n "\.admin\b" src/server/produtos.ts src/server/clientes.ts`
Expected: nenhuma linha (as duas telas seguem iguais; o `exigirAdmin` novo só acrescenta a exigência de estar numa distribuidora).

---

### Task 10: Catálogo público pelo vendedor

**Files:**
- Modify: `src/server/publico.ts:13-40, 47-129`
- Modify: `src/hooks/use-catalogos-publicos.ts`
- Modify: `src/app/(app)/vendedor/page.tsx`, `src/app/c/[slug]/escolher-catalogo.tsx`, `src/app/c/[slug]/[distribuidora]/catalogo.tsx`

**Interfaces:**
- Consumes: `camposCatalogo`, `catalogoNoAr` (Task 6).
- Produces: `catalogosDoVendedor(vendedorSlug: string): Promise<CatalogoPublico[]>`; `vitrine(vendedorSlug: string, catalogoSlug: string)`; `produtosDaVitrine({ catalogoId, secaoId, termo, pagina })`; `criarPedido({ vendedorId, catalogoId, clienteNome, observacao, itens })`; `useCatalogosPublicos(vendedorSlug: string | undefined)`.

- [ ] **Step 1: `src/server/publico.ts`, do `vendedorPorSlug` ao `vitrine`**

Import: `import { camposCatalogo, catalogoNoAr, condicaoBusca, sql } from "@/server/db";`.

```ts
/** UM vendedor, o do slug do link. Nome e WhatsApp da equipe inteira não são públicos. */
export const vendedorPorSlug = acao(async (slug: string) => {
  const [v] = await sql<{ id: string; nome: string; whatsapp: string }[]>`
    select v.id, v.nome, v.whatsapp
      from vendedores v join distribuidoras d on d.id = v.distribuidora_id
     where v.slug = ${String(slug)} and v.ativo and d.ativo`;
  return v ?? null;
});

/** Catálogos no ar da distribuidora do vendedor do link: o de outra dona nunca aparece. */
export const catalogosDoVendedor = acao(async (vendedorSlug: string) => [
  ...(await sql<CatalogoPublico[]>`
    select ${camposCatalogo()}
      from vendedores v
      join catalogos c on c.distribuidora_id = v.distribuidora_id
      left join distribuidoras m on m.id = c.marca_id
     where v.slug = ${String(vendedorSlug)} and v.ativo and ${catalogoNoAr()}
     order by nome`),
]);

/** Cabeçalho do catálogo e as abas numa ida só: as actions do client rodam uma por vez. */
export const vitrine = acao(async (vendedorSlug: string, catalogoSlug: string) => {
  const [c] = await sql<CatalogoPublico[]>`
    select ${camposCatalogo()}
      from vendedores v
      join catalogos c on c.distribuidora_id = v.distribuidora_id and c.slug = ${String(catalogoSlug)}
      left join distribuidoras m on m.id = c.marca_id
     where v.slug = ${String(vendedorSlug)} and v.ativo and ${catalogoNoAr()}`;
  if (!c) return null;
  const secoes = await sql<{ id: string; nome: string }[]>`
    select id, nome from catalogo_secoes where catalogo_id = ${c.id} order by ordem, nome`;
  return { ...c, secoes: [...secoes] };
});
```

- [ ] **Step 2: `produtosDaVitrine` e `criarPedido`**

```ts
const filtroVitrine = z.object({
  catalogoId: z.string().uuid(),
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
       where dp.catalogo_id = ${f.catalogoId}
         and p.ativo
         and exists (select 1 from catalogos c left join distribuidoras m on m.id = c.marca_id
                      where c.id = ${f.catalogoId} and ${catalogoNoAr()})
         ${f.secaoId ? sql`and dp.secao_id = ${f.secaoId}` : sql``}
         ${condicaoBusca(f.termo)}
       -- O ERP repete nome: sem desempate a rolagem repete um card e perde outro.
       order by p.nome, p.id
       limit ${PAGINA_VITRINE} offset ${f.pagina * PAGINA_VITRINE}`),
  ];
});
```

No `pedidoSchema`: `catalogoId: z.string().uuid(),` no lugar de `distribuidoraId`. Em `criarPedido`, antes do `sql.begin` (o fragmento de `sql` não entra numa query de `tx`):

```ts
  // O catálogo tem que ser da distribuidora do vendedor e estar no ar: uma página
  // aberta antes de o catálogo sair do ar não grava pedido.
  const [dona] = await sql<{ distribuidora_id: string }[]>`
    select c.distribuidora_id
      from vendedores v
      join catalogos c on c.id = ${p.catalogoId} and c.distribuidora_id = v.distribuidora_id
      left join distribuidoras m on m.id = c.marca_id
     where v.id = ${p.vendedorId} and v.ativo and ${catalogoNoAr()}`;
  if (!dona)
    throw new Recusa("Este catálogo não está mais disponível. Peça um novo link ao vendedor.");
```

e o insert do pedido:

```ts
    const [pedido] = await tx<{ id: string }[]>`
      insert into pedidos (vendedor_id, catalogo_id, distribuidora_id, cliente_nome, observacao, total_itens, origem_hash)
      values (${p.vendedorId}, ${p.catalogoId}, ${dona.distribuidora_id}, ${p.clienteNome || null},
              ${p.observacao || null}, ${p.itens.reduce((s, i) => s + i.quantidade, 0)}, ${origem})
      returning id`;
```

- [ ] **Step 3: `src/hooks/use-catalogos-publicos.ts`**

```ts
import { catalogosDoVendedor } from "@/server/publico";

/**
 * Catálogos que o cliente do link pode abrir: os da distribuidora do vendedor. O
 * painel do vendedor e a tela de escolha do cliente usam a mesma chave — uma ida
 * à rede só.
 */
export function useCatalogosPublicos(vendedorSlug: string | undefined) {
  return useQuery({
    queryKey: ["catalogos-publicos", vendedorSlug],
    enabled: !!vendedorSlug,
    queryFn: () => chamar(catalogosDoVendedor(vendedorSlug!)),
  });
}
```

- [ ] **Step 4: Quem usa o hook**

`src/app/(app)/vendedor/page.tsx`: `const catalogosQuery = useCatalogosPublicos(vendedorQuery.data?.slug);`.
`src/app/c/[slug]/escolher-catalogo.tsx`: `const catalogosQuery = useCatalogosPublicos(slug);`.

- [ ] **Step 5: `src/app/c/[slug]/[distribuidora]/catalogo.tsx`**

```tsx
    queryKey: ["distribuidora", slug, distribuidoraSlug],
    queryFn: () => chamar(vitrine(slug, distribuidoraSlug)),
```

Em `produtosDaVitrine({ ... })`: `catalogoId: distribuidora!.id,`. Em `criarPedido({ ... })`: `catalogoId: distribuidora.id,`.

- [ ] **Step 6: Conferir**

Run: `bun run typecheck && bun run lint`
Expected: typecheck sem erro nenhum no projeto; lint sem erro (os 6 avisos de `src/components/ui` já existiam).

- [ ] **Step 7: Parar: o usuário revisa e commita.**

---

### Task 11: Limpeza e documentação

**Files:**
- Delete: `scripts/sincronizar-supabase.ts`, `scripts/sincronizar-supabase.test.ts`
- Modify: `README.md` (seções "Banco" e "Login")

- [ ] **Step 1: Apagar o script de sincronização do Supabase e o teste dele**

Run: `rm scripts/sincronizar-supabase.ts scripts/sincronizar-supabase.test.ts`

- [ ] **Step 2: README — depois de "### Clientes vêm do ERP"**

```markdown
### Distribuidoras e catálogos

`crm.distribuidoras` é o cadastro do TI: quem usa o sistema (Abastex, DunoPro...) e as
marcas de catálogo (Dunorte, Elonorte...) — uma lista só. `crm.catalogos` guarda os
catálogos: cada um tem uma dona (`distribuidora_id`) e, se for de marca, a marca
(`marca_id`), de onde vêm nome, logo e cor; sem marca é o personalizado. Produtos do
catálogo ficam em `distribuidora_produtos` e seções em `catalogo_secoes`, as duas por
`catalogo_id`. Um catálogo está no ar se estiver ligado, a dona ativa e a marca (se
houver) ativa. A separação veio na `db/migrations/009_login_por_distribuidora.sql`,
que guardou a foto de antes em `crm_backup_20260929` (volta: `db/restaurar-backup-20260929.sql`).
```

- [ ] **Step 3: README — seção "## Login", primeiro parágrafo**

```markdown
Usuários ficam em `crm.usuarios` (senha bcrypt em `senha_hash`, distribuidora em
`distribuidora_id`), papéis em `crm.user_roles`: `ti`, `admin` e `vendedor`. O login é
só usuário e senha; a distribuidora vem do cadastro. Admin e vendedor só veem os
usuários, vendedores, catálogos e pedidos da distribuidora deles; o TI (sem
distribuidora, dado só pelo banco) escolhe em qual entrar e é o único com a tela
Distribuidoras. Produtos e clientes são compartilhados. Quem cria acesso é o admin, na
tela Usuários, e a pessoa nasce na distribuidora dele. As Server Actions em
`src/server/` conferem sessão, papel e distribuidora no banco antes de tocar em qualquer
dado — exceto as de `src/server/publico.ts`, que são o catálogo público (link do
vendedor) e são propositalmente anônimas, sem sessão.
```

- [ ] **Step 4: Conferir**

Run: `bun test && bun run typecheck && bun run lint`
Expected: testes PASS (os de integração seguem os de hoje), typecheck sem erro, lint sem erro.

- [ ] **Step 5: Parar: o usuário revisa e commita.**

---

### Task 12: Virada (com o usuário)

**Files:**
- Modify: `src/server/db.test.ts` (teste pós-virada)

- [ ] **Step 1: Ensaio final da 009 com os dados do momento**

Run: `bun scripts/aplicar-sql.ts --ensaio db/migrations/009_login_por_distribuidora.sql db/restaurar-backup-20260929.sql`
Expected: `Conferido: ...`, `Restaurado: ...`, `Ensaio desfeito`.

- [ ] **Step 2: Parar e combinar a hora com o usuário**

O usuário confirma que o código das Tasks 1–11 está commitado e pronto para o deploy.

- [ ] **Step 3: Aplicar a 009 (só com o "pode" do usuário)**

Run: `bun scripts/aplicar-sql.ts db/migrations/009_login_por_distribuidora.sql`
Expected: `NOTICE ... Conferido: ...` e `Aplicado: ...`. Logo em seguida o usuário sobe o deploy.

- [ ] **Step 4: Teste de integração pós-virada em `src/server/db.test.ts`**

```ts
  test("migração 009 aplicada", async () => {
    await sql`select id, distribuidora_id, marca_id, slug, ativo from catalogos limit 0`;
    await sql`select catalogo_id from distribuidora_produtos limit 0`;
    await sql`select catalogo_id from catalogo_secoes limit 0`;
    await sql`select catalogo_id, distribuidora_id from pedidos limit 0`;
    await sql`select distribuidora_id from usuarios limit 0`;
  });

  test("todo catálogo de marca da mesma dona tem marca diferente", async () => {
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from (
        select distribuidora_id, marca_id from catalogos where marca_id is not null
         group by 1, 2 having count(*) > 1) x`;
    expect(n).toBe(0);
  });
```

Run: `bun test src/server/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Fumaça no navegador (dev server do usuário, porta 8080)**

`SENHA_TESTE=... bun scripts/usuario-teste.ts criar` e conferir, na ordem:

1. Cookie antigo: a página logada manda para `/auth`.
2. `eduardo.oliveira` (TI) — só olhar, sem mudar nada: cai em "Escolher distribuidora"; entra na Abastex; vê o menu Distribuidoras; o menu mostra "Distribuidora: Abastex" com "Trocar".
3. `teste.admin` (Abastex): vê os 10 catálogos, os pedidos e os usuários da Abastex; não vê o menu Distribuidoras; abrindo `/admin/distribuidoras` pela URL a lista vem vazia e "Nova distribuidora" recusa com "Apenas o TI pode fazer isso." (a tela não tem guarda própria — menor adiado).
4. `teste.dunopro` (DunoPro): nenhum catálogo, pedido nem usuário da Abastex (a lista de Usuários só mostra ele e o `teste.vendedor.dunopro`).
5. Links públicos: `/c/teste-migracao` (Abastex) lista os catálogos da Abastex e `/c/teste-migracao/dunorte` abre o da Abastex; `/c/teste-dunopro` não lista nenhum e `/c/teste-dunopro/dunorte` mostra "Link não encontrado" com a Abastex tendo `dunorte`. Depois o `teste.dunopro` cria "Novo de distribuidora" → Dunorte e adiciona 1 produto: `/c/teste-dunopro/dunorte` abre o da DunoPro (1 produto), e o da Abastex segue com os dele. No fim, exclui o catálogo da DunoPro.
6. Pedido de uma página aberta com o catálogo desligado em seguida (desligar pelo admin de teste num personalizado de teste, criado e apagado na fumaça): recusa com a mensagem de catálogo indisponível.
7. TI dentro da DunoPro, desligar e religar a DunoPro: o `teste.dunopro` é recusado com "Sua distribuidora está desativada. Fale com o TI." enquanto desligada; o TI volta a escolher.

- [ ] **Step 6: Limpar**

Run: `bun scripts/usuario-teste.ts apagar` e conferir que nada de teste ficou (usuários `teste.*`, catálogos criados na fumaça).

- [ ] **Step 7: Parar: o usuário revisa e commita o teste novo.**
