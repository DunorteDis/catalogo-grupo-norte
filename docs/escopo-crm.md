# Escopo de desenvolvimento — CRM Grupo Norte (Abastex Connect)

30/09/2026 · Base para construir as funcionalidades do CRM. Cronograma visual em `roadmap_abastex_connect.pdf`.

## Objetivo e contexto

O CRM deve transformar a conversa do vendedor com o cliente no WhatsApp em pedido lançado no ERP, e usar o histórico de compras para puxar a recompra. A referência é o Sharpi (app.sharpi.com.br), apresentado na reunião de 18/09/2026 nos dois vídeos da pasta `videos/`. O catálogo por link que já existe continua como mais uma porta de entrada de pedido.

O que o Sharpi mostrou, tela por tela:

| Tela | O que faz |
| --- | --- |
| Negociações | Todo pedido que chega pelo WhatsApp cai sozinho aqui. Vista em lista ou em quadro com as etapas Oportunidades, Contatado, Aberto, Cotado, Aprovação, Lançado e Perdido; números do dia (pedidos, cotações, faturamento); filtros por contato, cliente e dia |
| Detalhe da negociação | Cabeçalho igual ao do ERP (cliente, data e tipo de entrega, observação da nota, forma de pagamento), pré-preenchido com o último pedido do cliente. Itens com foto, quantidade, unidade, preço, último preço, desconto e margem; acima de cada item, o texto que o cliente escreveu. Conversa do WhatsApp ao lado. Ações: validar políticas, histórico de pedidos, enviar cotação (imagem ou texto), lançar pedido |
| Busca de produtos | Estoque da loja e do CD, preço base, último preço e última compra do cliente, filtro "apenas comprados" |
| Produtos sugeridos | O que o cliente costuma comprar e está atrasado (ex.: "+83 dias"), com quantidade de compras e último preço; vai para o carrinho, para a cotação ou vira mensagem |
| Conversas | Caixa de entrada do WhatsApp dentro do CRM. Painel do contato com observação, pedido médio, pedidos lançados, taxa de conversão, faturamento, negociações recentes e clientes ligados ao número |
| Oportunidades | Clientes que passaram do ritmo de compra, com última compra e receita média esperada. Abre o mix do cliente (frequência e quantidade média por produto) e gera por IA uma mensagem de lembrete, sugestão, promoção ou produto novo |

Etapas da negociação:

```
Oportunidades → Contatado → Aberto → Cotado → (Aprovação) → Lançado
                              └────────┴──────────┴──→ Perdido, com o motivo registrado
```

- Oportunidades, Contatado e Aberto se preenchem sozinhas (cálculo diário, conversa do dia, pedido que chegou pela IA ou pelo catálogo). O vendedor assume a partir da cotação.
- Aprovação só aparece quando o pedido fura uma regra do ERP, e entra depois (Fase 5).

O menu do Sharpi também tem Agendamentos, Pedidos, Métricas e Configurações, que não apareceram na demonstração. Na reunião, o Sharpi disse usar uma API não oficial do WhatsApp com infraestrutura própria e sugeriu que a gente use um serviço pronto.

## Fases e datas (roadmap de 01/10/2026)

O WhatsApp veio para antes das negociações: com ele o cliente chega identificado pelo celular e o pedido se liga à conversa, e as negociações dependem de tabelas de preço e estoque que ainda não estão na cópia do Winthor.

| Fase | Período | Entrega | O que entra | Status |
| --- | --- | --- | --- | --- |
| 0 · Base de dados e carteira | 28/09 a 02/10 | 02/10/2026 | Módulo 1 | Iniciada |
| 1 · Conversas no WhatsApp | 05/10 a 09/10 | 09/10/2026 | Módulo 4 | Iniciada |
| 2 · Negociações com preço | 12/10 a 23/10 | 23/10/2026 | Módulo 2 e as regras básicas do módulo 3 | Não iniciada |
| 3 · Copiloto de pedido (IA) | 26/10 a 30/10 | 30/10/2026 | Módulo 5 | Não iniciada |
| 4 · Oportunidades e recompra | 02/11 a 06/11 | 06/11/2026 | Módulo 6 | Não iniciada |
| 5 · ERP, regras e métricas | 09/11 a 13/11 | 13/11/2026 | Lançamento direto no Venda Mais, resto do módulo 3 e módulo 7 | Não iniciada |
| 6 · Implementação | 16/11 a 20/11 | 20/11/2026 | Produção, WhatsApp de todos os vendedores, treinamento e acompanhamento | Não iniciada |

## Estado atual

Hoje o sistema é um catálogo digital com pedido pelo WhatsApp, separado por distribuidora. A parte de CRM ainda não existe: não há funil, histórico de atendimento nem carteira de clientes por vendedor.

| Área | O que já funciona | Onde |
| --- | --- | --- |
| Acesso | Login próprio (bcrypt e cookie JWT de 7 dias), papéis TI, admin e vendedor, senha provisória, TI escolhe a distribuidora ao entrar | `src/server/auth.ts`, `src/proxy.ts` |
| Distribuidoras | Cadastro com nome, cor e logo, liga e desliga; cada admin e vendedor vê só a sua | `/admin/distribuidoras` |
| Produtos | Espelho da `pcprodut` sincronizado todo dia às 03:00 (pg_cron); foto no S3 e descrição editáveis; o vendedor troca só a foto | `/admin/produtos`, `/produtos` |
| Catálogos | De marca ou personalizado, seções ordenáveis, vínculo por busca ou colando EANs, cópia entre catálogos | `/admin/catalogo` |
| Vitrine pública | Link do vendedor, escolha do catálogo, carrinho por unidade ou caixa, pedido gravado e aberto no `wa.me` | `/c/[slug]/[distribuidora]` |
| Pedidos | Lista por período com itens e exportação para Excel no layout 9816-2 | `/admin/pedidos`, `/meus-pedidos` |
| Clientes | Leitura da `pcclient` com busca; contatos do ERP só leitura e contatos próprios com tipo | `/admin/clientes` |
| Usuários | Admin e vendedor na mesma tela, reset de senha, envio de credenciais pelo WhatsApp | `/admin/usuarios` |
| Painel | Quantidade de pedidos, pedidos por dia, ranking e vendedores sem pedido | `/admin` |

O que falta na base para virar CRM:

- O pedido guarda o cliente como texto livre: sem `codcli`, sem preço, sem status e sem número no ERP.
- O vendedor é um cadastro do app, sem ligação com o RCA (`codusur`), então não há carteira.
- Nada de vendas, preços, estoque, títulos ou metas é lido do ERP; só produtos e clientes.
- O WhatsApp é só o link `wa.me`; não há API de mensagens.
- Sem CI, desenvolvimento e produção no mesmo banco, freio de login válido para uma instância só, schema-base fora das migrações.

## Módulos no escopo

São sete módulos, na ordem em que um depende do outro. Cada um tem um critério de aceite que se confere com um vendedor usando o sistema de verdade.

### 1. Base de dados e carteira

- Carga das tabelas do Winthor listadas em Dados e integrações.
- Vendedor ligado ao RCA (`codusur`); cada vendedor vê só os clientes da carteira dele, e o admin vê todos.
- Pedido do catálogo ligado a um cliente (`codcli`), escolhido pelo vendedor quando o pedido chega.
- Tela do cliente: últimos pedidos, último preço de cada produto, mix de compra e títulos em aberto.

**Aceite:** para 10 clientes escolhidos pelo comercial, o último pedido e o último preço na tela batem com o Winthor.

### 2. Negociações

- Etapas Aberto, Cotado, Aprovação, Lançado e Perdido, com motivo na perda. Vista em lista e em quadro, números do dia e filtros por vendedor, cliente e dia.
- Detalhe com o cabeçalho do ERP (cliente, plano de pagamento, data e tipo de entrega, observação da nota), pré-preenchido com o último pedido do cliente e com troca de cliente.
- Itens com foto, quantidade, unidade, preço de tabela, último preço, desconto e margem. Troca de produto por um botão no item.
- Busca de produtos com estoque da loja e do CD, último preço, última compra do cliente e o filtro "apenas comprados".
- Cotação gerada em imagem e em texto para mandar ao cliente.
- Lançar pedido pela planilha 9816-2 que já existe, até a gravação direta ficar pronta.

**Aceite:** o vendedor monta uma cotação para um cliente real sem sair do CRM, a margem confere com a conta do comercial e o pedido entra no Winthor pela planilha.

### 3. Regras do ERP

Na reunião, o Sharpi apontou esta parte como o maior risco, e eles mesmos ainda não a terminaram. Um pedido errado lançado no ERP custa mais que qualquer outra falha.

- Antes de cotar ou lançar: cliente bloqueado, limite de crédito, preço fora do permitido e desconto acima do limite bloqueiam com a mensagem do motivo.
- Depois: combos, campanhas e as demais políticas comerciais do Winthor.
- Fluxo de aprovação: o pedido que fura uma regra vai para a etapa Aprovação e um supervisor libera ou recusa. O Sharpi disse que isso não seria usado de início; entra depois.

**Aceite:** um conjunto de pedidos de teste montado com o comercial (casos que passam e casos que devem ser barrados) dá o mesmo resultado no CRM e no Winthor.

### 4. Conversas (WhatsApp)

- Cada vendedor conecta o próprio número. O CRM recebe e envia texto, imagem, PDF e áudio.
- Caixa de entrada com não lidas e arquivadas. O gestor abre a conversa de qualquer vendedor.
- O contato é ligado ao cliente pelo celular, com troca manual quando o número atende mais de um cliente.
- Painel do contato: observação, pedido médio, pedidos lançados, taxa de conversão, faturamento e negociações recentes.
- Conversa ao lado do detalhe da negociação, com a cotação enviada direto por ali.
- Quem conversou com o vendedor no dia aparece sozinho na etapa Contatado.

**Aceite:** um vendedor atende um dia inteiro pelo CRM sem abrir o WhatsApp do celular.

### 5. Copiloto de pedido (IA)

- A mensagem do cliente que pede produtos vira sozinha uma negociação em Aberto, com os itens já casados.
- O casamento olha o catálogo e o histórico do cliente, porque o cliente escreve pouco e costuma pedir o que já comprou. O texto que ele escreveu fica visível em cima de cada item.
- Conversão de unidade: "20 kg" de um produto vendido em caixa vira a quantidade certa de caixas.
- Transcrição de áudio, se o custo compensar (decisão em aberto).

**Aceite (meta proposta):** em duas semanas de uso, o vendedor aceita sem trocar pelo menos 8 de cada 10 itens que a IA casou.

### 6. Oportunidades e produtos sugeridos

- Cálculo diário do padrão de compra por cliente e por produto: frequência, quantidade média e dias de atraso.
- Etapa Oportunidades no quadro: cliente fora do ritmo, última compra e receita média esperada.
- Mix do cliente e produtos sugeridos (os que saíram do padrão), iguais na oportunidade e dentro da negociação.
- Mensagem escrita pela IA a partir da conversa e do histórico, em quatro tipos (lembrete, sugestão de produto, promoção, produto novo) e com instruções extras. O vendedor revisa e envia.

**Aceite:** cada vendedor abre a lista do dia da carteira dele e manda as mensagens pelo CRM; o painel mostra quantas oportunidades viraram pedido.

### 7. Métricas

- Faturamento, pedido médio, conversão por etapa e perdas por motivo, por vendedor e por distribuidora, estendendo o painel `/admin` que já existe.

**Aceite:** os números do mês batem com o relatório de vendas do Winthor para os pedidos lançados pelo CRM.

## Dados e integrações

Quase tudo que o Sharpi mostra sai do histórico de vendas do Winthor. A base do projeto é trazer esse histórico para o schema `system` e ligar vendedor, cliente e pedido pelos códigos do ERP.

### O que ler do Winthor (schema `system`, só leitura)

| Tabela | Para quê | Já existe na cópia? |
| --- | --- | --- |
| `pcclient` | Cliente, RCA, plano de pagamento, bloqueio, limite | Sim |
| `pccontato` | Contatos do ERP | Sim |
| `pcprodut` | Produtos | Sim |
| `pcusuari` | Vendedores internos (`tipovend = 'I'`) para o cadastro de usuário e o `codusur` | Sim, em uso |
| `vendedor_interno_carteira` e `vendedor_carteira_cliente` | Carteira pelo `codusur`: internos na primeira, RCA e externos na segunda (sem códigos em comum) | Sim, em uso |
| `pcclient` (limite e bloqueio) | `limcred`, `bloqueio`, `motivobloq`, `dtbloq`, `vlcredcli`, `codcob`, `codplpag`, `dtultcomp` | Sim, em uso |
| `portal_vendedor.cliente_pendencias` | Títulos em aberto do cliente; `codcob = 'VERB'` é verba e fica fora da dívida | Sim, em uso |
| `portal_vendedor.credito_cliente` | Créditos do cliente ainda não usados (`dtdesconto` nulo) | Sim, em uso |
| `score.faturamento_por_cliente` | Pedidos do ERP por cliente, RCA e produto: duas linhas por produto (a do pedido, com `vlr_tot_pedido`; a do faturamento, com nota, `qtd_faturado_liq` e `vlr_tot_faturado_venda`), `posicao_ped` e entrega. Atualiza com 1 dia de atraso (depois, 2 horas). Base do histórico do cliente (últimos pedidos, mix, último preço). Índice por cliente, RCA e data, não por pedido | Sim, ainda não usada |
| `pcpedc` e `pcpedi` | Histórico de pedidos e itens (coberto em boa parte pela linha acima) | Não existem na cópia |
| `pctabpr` e `pcpraca` | Preço de tabela pela região do cliente | Confirmar |
| `pcest` | Estoque e custo por filial (loja e CD), base da margem | Confirmar |
| `pcplpag` e `pccob` | Nomes dos planos de pagamento e das cobranças (hoje só aparecem os códigos) | Não existem na cópia |

A cópia é diária (por volta das 02:00), então estoque e preço ficam com um dia de atraso. Serve para começar; se o vendedor precisar de estoque na hora, a carga dessas duas tabelas tem que ficar mais frequente.

### O que muda no schema `crm`

- **`vendedores`** ganha `codusur`: sem isso não existe carteira de clientes.
- **`pedidos` vira a negociação.** Ganha `codcli`, `etapa` (aberto, cotado, aprovação, lançado, perdido), `origem` (catálogo, WhatsApp, manual), `conversa_id`, plano de pagamento, data e tipo de entrega, observação da nota, totais, motivo da perda e número do pedido no ERP. Uma tabela só, sem duplicar pedido e negociação.
- **`pedido_itens`** ganha `codprod`, preço de tabela, preço praticado, custo, desconto e o texto original que o cliente escreveu.
- **Novas:** `whatsapp_numeros` (número de cada vendedor e situação da conexão), `conversas` (contato, vendedor, cliente ligado) e `mensagens` (direção, tipo, texto, mídia, horário, id no WhatsApp).
- **Oportunidades** são cálculo, não cadastro: uma visão materializada por cliente e por cliente e produto (intervalo médio de compra, dias desde a última, receita média), recalculada pelo `pg_cron` depois da carga do ERP, como já é feito com os produtos. Só o estado (contatado, descartado) fica numa tabela.
- O contato do WhatsApp chega ao cliente pelo celular: `cliente_contatos` (já existe e foi criado para isso), `pccontato` e `telent1`.

### Integrações externas

| Integração | Proposta | Observação |
| --- | --- | --- |
| WhatsApp | W-API (não oficial, `api.w-api.app`): uma instância por número de vendedor (`crm.whatsapp_numeros`: `instanceId` e token). Recebe por webhook em `/api/whatsapp?chave=WAPI_WEBHOOK_CHAVE` e envia por `/v1/message/send-text`. Mensagens em `crm.conversas` e `crm.mensagens` (corpo bruto em `jsonb`); o cliente sai do celular (`crm.chave_telefone`: DDD + 8 últimos dígitos) e o pedido do catálogo se liga à conversa pelo "Pedido #XXXXXXXX" da mensagem | Piloto: usuário "vendedor" (92981219124). Mídia (foto, áudio, PDF) ainda só aparece como rótulo |
| IA | API da Anthropic (Claude) para ler o pedido na mensagem, casar produtos e escrever mensagens | O casamento de produto começa com busca por texto no banco (`pg_trgm`) filtrada pelo histórico do cliente; a IA só escolhe entre os candidatos |
| Lançar no ERP | O pedido só vai ao Winthor quando o vendedor manda, por uma rota de integração (ainda não existe). A rota devolve o número do pedido no Winthor, que fica gravado no pedido do CRM. Até lá, planilha 9816-2 | Nunca ligar pedido do CRM ao do ERP por semelhança de produtos: o vínculo nasce do envio |

## Padrões técnicos

Todo módulo novo segue o que já está no repositório; nada de framework, ORM ou fila nova sem necessidade medida.

- **Next.js 16 (App Router).** Telas em `src/app/(app)/...`, regras em Server Actions em `src/server/*` embrulhadas por `acao()`. O middleware é `src/proxy.ts`. Antes de usar uma API do Next, ler o guia em `node_modules/next/dist/docs/`.
- **Rotas HTTP só para quem vem de fora.** Webhook do WhatsApp e retorno do ERP entram como route handler (`src/app/api/.../route.ts`), com verificação de assinatura ou token.
- **Postgres, schema `crm`, SQL direto (postgres.js).** Cada mudança de schema é um arquivo novo em `db/migrations/`, ensaiado com `bun scripts/aplicar-sql.ts --ensaio`; ele entra sozinho quando o servidor sobe (`src/server/migracoes.ts`).
- **ERP só leitura.** Dados do Winthor vêm do schema `system` (cópia diária das `pc*`); o CRM nunca escreve nele. A gravação do pedido no ERP é uma decisão à parte (veja Dados e integrações).
- **Isolamento por distribuidora.** Toda consulta filtra por `distribuidora_id`; papéis `ti`, `admin` e `vendedor` conferidos no banco a cada action, como hoje.
- **Interface Abastex.** Tokens de `src/abastex.css`, componentes de `src/components/abastex.tsx`, nunca cor solta; a cor da distribuidora é dado.
- **Tempo real simples.** Lista de negociações e conversas atualizam por consulta periódica (poucos segundos); WebSocket só se a consulta pesar no banco.
- **Testes.** `bun test` para a lógica que decide dinheiro ou produto (margem, desconto, casamento de produto, regras de política); `bun run typecheck` e lint antes de juntar ao `main`.
- **Segredos no `.env`.** Chaves da API do WhatsApp e do modelo de IA entram no `.env.example` sem valor.

## Fora do escopo e decisões em aberto

Fica de fora desta versão o que o Sharpi não demonstrou ou o que depende de uma decisão ainda não tomada.

**Fora do escopo por enquanto**

- Pagamento pelo CRM (o botão "Pague com Sharpi" apareceu, mas não foi mostrado).
- Agendamentos, que estão no menu do Sharpi e também não foram mostrados.
- IA respondendo sozinha ao cliente: ela só sugere, e quem envia é sempre o vendedor.
- Leitura de foto de lista de compras.
- Aplicativo de celular: o CRM é web e precisa funcionar bem na tela do celular.

**Decisões em aberto**

- [x] WhatsApp oficial ou não oficial? Não oficial, pela W-API, com o usuário "vendedor" de piloto. Quem vê: o vendedor vê as conversas dele (módulo Conversas e no pedido); o admin vê a conversa ligada ao pedido, só leitura.
- [ ] O CRM substitui a plataforma de atendimento que a equipe usa hoje ou convive com ela? A Angela e o Helder levantaram juntar as duas. Substituir traz para o escopo as regras de redirecionamento (distribuir clientes entre vendedores, repassar a conversa de quem está de férias), o que soma cerca de duas semanas.
- [ ] Transcrever todos os áudios dos clientes? Ajuda o vendedor e a IA, mas o próprio Sharpi disse que é caro.
- [ ] Quem mantém a carga do schema `system` e pode incluir as tabelas novas?
- [ ] Rota de envio do pedido ao Winthor: quando fica pronta, o que ela recebe (cliente, plano, itens, preços) e como devolve o número do pedido?
- [ ] Quais regras comerciais do Winthor valem na primeira versão? A lista precisa sair de uma conversa com o comercial.
- [ ] Aceitar a oferta do Sharpi de uma conversa semanal de 10 a 15 minutos para revisar a evolução.
