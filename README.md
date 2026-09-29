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

### Produtos vêm do ERP

Só existem duas tabelas de produto: a `system.pcprodut` (fonte, uma linha por `codprod`)
e o `crm.produtos` (espelho, também uma linha por `cod_produto`). A `system.produtos` não
entra em nada daqui (a herança dela saiu em `db/migrations/004_uma_linha_por_codprod.sql`).

`crm.produtos` segue a `system.pcprodut`, que é recarregada todo dia (~02:00). A função
`crm.sincronizar_produtos()` (em `db/migrations/002_sincronizar_produtos.sql`) roda pelo
`pg_cron` às 03:00 (job `sincronizar-produtos-erp`) e reconcilia pelo
`cod_produto = codprod`: cadastra o que é novo, põe nome e EAN do ERP, desativa quem saiu
e reativa quem voltou. Nunca apaga (o id é a chave dos catálogos) e não mexe no `ativo`
de quem está no ERP nem na foto. Se a `pcprodut` vier vazia ou bem menor que na última
execução, não faz nada. A `pcprodut` só é lida, nunca escrita.

No sistema não se cria nem se exclui produto: a tela Produtos só edita foto e descrição.
Descrição diferente da do ERP marca `nome_editado`, e aí a sincronização para de
sobrescrevê-la (`db/migrations/003_nome_editado.sql`); voltar à do ERP desmarca.
Cada execução fica em `crm.sincronizacao_produtos`:

```sql
select * from crm.sincronizacao_produtos order by quando desc limit 5;
select crm.sincronizar_produtos();  -- rodar na mão, se precisar
```

### Clientes vêm do ERP

A tela Clientes lista a `system.pcclient` (só leitura): sem `dtexclusao` é ativo, com ela
é inativo. Os contatos do ERP vêm da `system.pccontato` pelo `codcli` e também só são
lidos. Os que o admin acrescenta ou edita ficam em `crm.cliente_contatos`
(`db/migrations/005_cliente_contatos.sql`): nome e celular, este gravado só com dígitos,
DDD + número, sem o 55 — é por ele que se vai saber de que cliente é quem chama o
vendedor no WhatsApp.

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

## Docker

O container roda só o app (porta 8080); Postgres e S3 são externos e entram pelas
variáveis do `.env`. No servidor, com o `.env` preenchido (as mesmas do `.env.example`)
ao lado do `docker-compose.yml`:

```sh
docker compose up -d --build   # sobe (e reconstrói depois de um git pull)
docker compose logs -f app     # acompanha o log
```

A imagem é o build `standalone` do Next em Node 22, rodando sem root. O `.env` não entra
na imagem (`.dockerignore`): o compose injeta as variáveis na hora de subir. Use o
compose em vez de `docker run --env-file`, que deixaria as aspas do `.env` dentro dos
valores. As notas de Produção acima valem igual: proxy reverso na frente e um container só.

Acessando por `http://IP:porta`, sem HTTPS, ponha `COOKIE_INSEGURO=1` no `.env`: sem isso
o navegador descarta o cookie de sessão e o login recusa com esse aviso.
