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

`S3_BUCKET` e as `AWS_*` guardam as fotos de produto arrastadas no cadastro. O bucket
fica privado: a foto vai para `produtos/<uuid>.<ext>`, o banco guarda `/fotos/<uuid>.<ext>`
e essa rota responde com uma URL assinada que vale 1 hora. A chave precisa de
`s3:PutObject` e `s3:GetObject` nesse prefixo.

## Banco

Tabelas e dados vivem no schema `crm`. Mudança de schema é um arquivo novo em
`db/migrations/`, aplicado com:

```sh
bun scripts/aplicar-sql.ts db/migrations/<arquivo>.sql
```

## Login

Usuários ficam em `crm.usuarios` (senha bcrypt em `senha_hash`), papéis em
`crm.user_roles`. Quem cria acesso é o admin, na tela Usuários. As Server Actions em
`src/server/` conferem a sessão e o papel antes de tocar no banco — exceto as de
`src/server/publico.ts`, que são o catálogo público (link do vendedor) e são
propositalmente anônimas, sem sessão.

## Produção

- **Proxy reverso obrigatório**: sirva atrás de um proxy que **sobrescreve**
  `X-Forwarded-For` com o IP real do cliente — nginx: `proxy_set_header X-Forwarded-For
  $remote_addr;`, nunca `$proxy_add_x_forwarded_for` (esse **acrescenta** ao cabeçalho
  em vez de substituir, e deixa o próprio cliente escolher o primeiro valor). O freio de
  login (`src/server/freio.ts`) e o antispam de pedido (`src/server/publico.ts`)
  confiam nesse cabeçalho para identificar quem está tentando.
- **Host público**: o proxy também precisa repassar o host público —
  `proxy_set_header Host $host;` (ou `X-Forwarded-Host`) — senão a checagem de origem
  das Server Actions do Next recusa toda ação (login, pedido). Alternativa:
  `experimental.serverActions.allowedOrigins` em `next.config.ts`.
- **Uma instância só**: o freio de login mora em memória (`src/server/freio.ts`); com
  mais de uma instância atrás de um balanceador, os erros não somam entre elas e o
  freio não seguraria mais os tetos de tentativas.
- `COOKIE_INSEGURO=1` só se o site for servido por HTTP puro, sem HTTPS.
- Vale colocar rate limit em `POST /auth` no proxy, como camada extra ao freio de login.
