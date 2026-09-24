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
