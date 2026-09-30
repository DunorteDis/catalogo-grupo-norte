# Login por distribuidora — desenho

Data: 2026-09-29. Status: aguardando revisão.

## Objetivo

Cada distribuidora que usa o sistema (Abastex, DunoPro...) enxerga só o que é dela:
usuários, vendedores, catálogos e os pedidos gerados pelos vendedores dela. Uma
distribuidora pode montar catálogos com a marca de qualquer distribuidora (a Abastex
tem o seu catálogo Dunorte, a DunoPro pode ter o dela, com outros produtos). Um papel
novo, **TI**, enxerga tudo: entra em qualquer distribuidora e é o único que cadastra
distribuidoras. Por enquanto só o `eduardo.oliveira` é TI.

## Decisões (combinadas na conversa)

| Tema | Decisão |
|---|---|
| Login | Usuário e senha, como hoje. A distribuidora vem do cadastro da pessoa. |
| TI | Sem distribuidora. Ao entrar escolhe uma; troca quando quiser. Único com a tela Distribuidoras. Papel dado só no banco. |
| Lista de distribuidoras | Uma lista só: quem usa o sistema e as marcas de catálogo são o mesmo cadastro. |
| Catálogo de marca | No máximo um por marca em cada distribuidora; nome, logo e cor vêm da marca. Seleção com nome próprio continua sendo o catálogo personalizado. |
| Produtos | Compartilhados. Admin de qualquer distribuidora edita foto e descrição, e vale para todas. |
| Clientes (contatos) | Compartilhados entre todas as distribuidoras. |
| Desligar distribuidora | Tira do ar tudo dela: usuários não entram, catálogos dela saem do ar, e catálogos de outras donas com a marca dela também saem. |
| Dados de hoje | Todos passam a ser da Abastex (catálogos, pedidos, usuários, vendedores), menos o `eduardo.oliveira`, que vira TI sem distribuidora. |
| Virada | Direto no schema `crm`, junto com o deploy do código novo. O sistema fica fora do ar nesse intervalo. |
| Perda de dados | Nenhuma. Nada de hoje é apagado sem cópia; ver "Migração". |

## Modelo de dados

Hoje uma linha de `crm.distribuidoras` é a marca **e** o catálogo da Abastex ao mesmo
tempo: produtos (`distribuidora_produtos`), seções (`catalogo_secoes`) e pedidos
apontam para ela, e os 3 catálogos personalizados também moram ali. A mudança separa
as duas coisas com **uma tabela nova, `crm.catalogos`**.

### `crm.distribuidoras` (fica; só distribuidoras)

Cadastro do TI: `id, nome, slug, cor, logo_url, ativo, created_at, updated_at`. Hoje
tem as 7 marcas antigas, a Abastex e a DunoPro (12 linhas com os 3 personalizados).
Depois da migração: as 9 distribuidoras. As colunas que só servem a catálogo
(`personalizado`, `emoji`, `imagem_url`) deixam de ser usadas pelo código e só saem
numa migração de limpeza posterior, depois de conferido que está tudo certo.

### `crm.catalogos` (nova)

| Coluna | O que é |
|---|---|
| `id uuid` | Mesmo id da linha de `distribuidoras` que era o catálogo: nenhuma ligação muda de valor. |
| `distribuidora_id uuid not null` → `distribuidoras` | A dona do catálogo. `on delete restrict`. |
| `marca_id uuid null` → `distribuidoras` | A marca do catálogo. Nula = personalizado. `on delete restrict`. |
| `slug text not null` | Parte do link `/c/<vendedor>/<slug>`. Catálogo de marca usa o slug da marca. |
| `nome, cor` | Só do personalizado (`check`: marca ou nome+cor). O de marca lê nome, cor e logo da marca, então trocar o logo da Dunorte muda o catálogo Dunorte de todas. |
| `emoji, imagem_url` | Só do personalizado, como hoje. |
| `ativo boolean` | Liga e desliga o catálogo (vai para a tela Catálogos). |
| `created_at, updated_at` | Como nas outras tabelas. |

Únicos: `(distribuidora_id, slug)` e `(distribuidora_id, marca_id)`. O slug deixa de
ser único no banco todo e passa a ser único **dentro** de cada dona: Abastex e DunoPro
podem ter, cada uma, o seu `/dunorte`.

Catálogo no ar para o cliente = `catalogos.ativo` e dona ativa e (marca nula ou marca
ativa).

### Tabelas que passam a apontar para `catalogos`

| Tabela | Mudança |
|---|---|
| `catalogo_secoes` | Coluna `distribuidora_id` vira `catalogo_id`, FK para `catalogos` (`on delete cascade`, como hoje). |
| `distribuidora_produtos` | Coluna `distribuidora_id` vira `catalogo_id`, FK para `catalogos` (`on delete cascade`, como hoje). O nome da tabela fica. |
| `pedidos` | Coluna `distribuidora_id` vira `catalogo_id`, FK para `catalogos` (`on delete set null`, como hoje). Coluna nova `distribuidora_id not null` → `distribuidoras`: a dona do pedido, gravada na criação. |

### Pessoas

| Tabela | Mudança |
|---|---|
| `usuarios` | Coluna nova `distribuidora_id` → `distribuidoras` (`on delete restrict`). Nula só no TI. |
| `vendedores` | `distribuidora_id` já existe (vazia, apontando para a tabela antiga, `on delete cascade`). Passa a apontar para `distribuidoras` com `on delete restrict` e `not null`. |
| `user_roles` | O enum `crm.app_role` ganha o valor `ti`. |

## Migração

Números de hoje (2026-09-29): 12 linhas em `distribuidoras` (7 marcas, 3
personalizados, Abastex, DunoPro), 9.683 vínculos de produto, 47 seções, 40 pedidos
(4 sem catálogo), 368 itens, 9 vendedores, 11 usuários.

### Arquivos

- **`008_papel_ti.sql`** — pode rodar a qualquer momento, o código de hoje não se
  importa: `alter type crm.app_role add value 'ti'`. Fica fora da migração principal
  porque o Postgres não deixa usar um valor novo de enum na mesma transação que o
  criou.
- **`009_login_por_distribuidora.sql`** — a migração principal, uma transação só
  (entra tudo ou nada), rodada na hora do deploy.

### Passos da 009, nesta ordem

1. Trava as tabelas envolvidas, para nenhum pedido entrar no meio.
2. Cópia de segurança, já com as tabelas travadas (então é a foto exata do momento
   da virada): schema `crm_backup_20260929` com `distribuidoras`,
   `distribuidora_produtos`, `catalogo_secoes`, `pedidos`, `pedido_itens`,
   `vendedores`, `usuarios` e `user_roles`, por `create table ... as select *`. As
   contagens de conferência saem dessa cópia.
3. Acha a Abastex pelo slug `abastex`; sem ela, aborta.
4. Separa as linhas que são catálogo: os personalizados e as 7 marcas antigas (slugs
   `dunorte`, `elonorte`, `gruponorte`, `metanorte`, `mixnorte`, `rotanorte`,
   `supergiro`). Confere que nenhuma outra linha tem produto, seção ou pedido; se
   tiver, aborta com o nome dela.
5. Cria `catalogos` e copia as linhas que são catálogo (hoje 10), **com o mesmo id**:
   as marcas (dona Abastex, marca = ela mesma, mesmo slug e ativo) e os personalizados
   (dona Abastex, sem marca, com nome, cor, emoji e imagem).
6. Troca as FKs de `catalogo_secoes`, `distribuidora_produtos` e `pedidos` para
   `catalogos`, renomeando a coluna para `catalogo_id`. Os valores não mudam.
7. `pedidos.distribuidora_id` novo = Abastex em todos (hoje 40).
8. `usuarios.distribuidora_id` = Abastex em todos, menos `eduardo.oliveira`.
   `vendedores.distribuidora_id` = Abastex em todos (hoje 9), FK trocada, `not null`.
9. `eduardo.oliveira`: ganha o papel `ti` e perde o `admin`.
10. Só **depois** das FKs trocadas, apaga de `distribuidoras` as linhas de
   personalizado, hoje 3 (já estão em `catalogos` e na cópia de segurança). A ordem importa:
   antes da troca, o `on delete cascade` levaria produtos e seções junto.
11. Conferência final, que aborta a transação inteira se algo não bater com a cópia
    de segurança: vínculos, seções, pedidos e itens com a mesma contagem; todo vínculo,
    seção e pedido com catálogo apontando para um catálogo que existe; tantos catálogos
    quantas linhas separadas no passo 4;
    todo pedido com dona; todo usuário com distribuidora (menos o TI); todo vendedor
    com distribuidora.

### Ensaio

Antes da virada, a 009 roda de verdade no `crm` dentro de uma transação que é
desfeita no fim (`bun scripts/aplicar-sql.ts --ensaio <arquivo>`, flag nova). Mostra
se ela passa na conferência com os dados reais, sem mudar nada. Foi assim com a 003.

### Virada

1. A qualquer momento: aplicar a 008 e rodar o ensaio da 009 (que também ensaia a
   cópia de segurança e é desfeito inteiro).
2. Na hora do deploy: aplicar a 009 e subir o código novo logo em seguida. O sistema
   fica fora do ar nesse intervalo, inclusive os links de catálogo.
3. Todo mundo entra de novo: a sessão antiga não tem distribuidora e é recusada.
4. Fumaça no navegador com cada papel (TI, admin Abastex, vendedor) e um link público.

Como o dev e a produção usam o mesmo banco, o código novo só roda de verdade depois
da 009. Antes disso vale o que dá para conferir sem o banco novo: typecheck, lint,
testes e o ensaio.

### Volta atrás

Se algo der errado depois da 009: um script `db/restaurar-backup-20260929.sql` refaz
as tabelas a partir de `crm_backup_20260929` (e apaga `catalogos`), e o código antigo
volta no deploy. Pedidos feitos depois da virada ficariam de fora dessa volta; por isso
a fumaça é logo em seguida.

## Login, sessão e permissões

- **Sessão (JWT):** `sub`, `email`, `papel` (`ti` | `admin` | `vendedor`), `dist`
  (distribuidora em uso, ou nula no TI que ainda não escolheu) e `prov`. Token sem
  `papel` (o de antes da virada) é recusado.
- **`entrar`:** lê papel e distribuidora do banco. Distribuidora desligada recusa com
  "Sua distribuidora está desativada. Fale com o TI." TI vai para
  `/escolher-distribuidora`; os outros, como hoje.
- **A cada ação:** `exigirLogin` confere no banco papel, distribuidora e se ela está
  ativa (hoje já confere o papel). Para admin e vendedor, a distribuidora vem do
  banco, não do token: mudar alguém de distribuidora ou desligá-la vale na hora. Para
  o TI, vem do token, conferida como existente e ativa.
- **`exigirAdmin`** passa a devolver a distribuidora em uso (admin ou TI que já
  escolheu). **`exigirTI`** é novo, para a tela Distribuidoras.
- **TI:** tela `/escolher-distribuidora` com as ativas, e um seletor no topo do menu
  para trocar. Trocar regrava o cookie com a nova `dist`.

## O que cada tela passa a fazer

| Tela | Mudança |
|---|---|
| Distribuidoras | Só TI (menu e action). Liga e desliga a distribuidora (regra de "desligar"). |
| Visão geral, Pedidos | Filtram `pedidos.distribuidora_id` e vendedores pela distribuidora em uso. |
| Catálogos | Lista os catálogos da distribuidora em uso. "Novo catálogo": **de uma distribuidora** (marcas ativas que a dona ainda não tem) ou **personalizado** (como hoje). O liga e desliga de catálogo de marca vem para cá. "Começar com uma cópia de" só lista catálogos da mesma dona. Toda action de catálogo, seção e vínculo confere que o catálogo é da distribuidora em uso. |
| Usuários | Lista, cria, edita e exclui só usuários e vendedores da distribuidora em uso; quem é criado nasce nela. Papéis na tela: admin e vendedor. |
| Produtos, Clientes | Sem mudança (compartilhados). |
| Meus links, Meus pedidos | Catálogos da distribuidora do vendedor; pedidos dele, como hoje. |
| Link público `/c/<vendedor>` e `/c/<vendedor>/<slug>` | O vendedor define a distribuidora: a lista e o catálogo saem só dela (`vendedor.distribuidora_id` + slug). `criarPedido` confere que o catálogo é da distribuidora do vendedor e grava a dona no pedido. |

## Fora deste trabalho

- Criar ou tirar TI pela tela (fica no banco).
- Apagar as colunas antigas de `distribuidoras` (`personalizado`, `emoji`,
  `imagem_url`) e o schema de backup: migração de limpeza depois de uns dias.
- `scripts/sincronizar-supabase.ts` (sincronização de antes da virada do Supabase):
  para de bater com o schema novo. Proposta: apagar o script e o teste dele.

## Testes

- Unitários (`bun test`): sessão com `papel` e `dist` (assinar, ler, recusar token
  antigo) e a regra de catálogo no ar.
- Integração só leitura (`src/server/db.test.ts`): depois da 009, "migração 009
  aplicada" e isolamento (catálogos filtrados por dona).
- Ensaio da 009 com os dados reais antes da virada.
- Fumaça no navegador depois da virada, por papel.
