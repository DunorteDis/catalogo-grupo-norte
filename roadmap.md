# Tarefas

- [x] Catálogo público por vendedor com pedido pelo WhatsApp
- [x] Administração (vendedores, distribuidoras, produtos, pedidos)
- [x] Mensagens e avisos em português
- [x] Cadastro aberto removido; usuários criados só pelo admin, sem confirmação por e-mail
- [x] Aplicar novo tema (cores terracota/azul, fontes Outfit + Fira Code) em todo o sistema
- [x] Redesign com o design system Abastex: roxo + menta, logo e favicon Abastex, PageHeader/KPIs/listas do DS em todas as telas, modo escuro completo
- [x] Sistema inicia no login (/ redireciona para /auth) com layout split-screen e marca Grupo Norte
- [x] Shell autenticado com sidebar (shadcn) compartilhada por admin e vendedor, com alternancia claro/escuro
- [x] Vendedores e Usuários fundidos numa tela só (todo vendedor nasce com login; órfãos ficam visíveis e recuperáveis)
- [x] Acesso por usuário gerado do nome + senha aleatória de 6 caracteres; reset de senha e copiar credenciais para WhatsApp
- [x] Catálogo personalizado: seleção sem distribuidora, montada por busca, códigos colados ou cópia de outro catálogo, publicada como link extra do vendedor
- [x] Seções dentro do catálogo: abas que o admin cria, ordena e usa como destino do que adicionar; o cliente troca de aba na barra grudenta do catálogo
- [x] Cadastro de produto pelo painel (código, nome, foto por arquivo ou link, com prévia) e exclusão com aviso de que sai de todos os catálogos
- [x] Cadastro de produtos espelha o export do ERP linha a linha (7.248 linhas, sem UNIQUE em codigo, com cod_empresa); colar códigos vincula um cadastro por EAN
- [x] Pedido no estilo app de delivery: tocar no produto abre painel com foto, unidade (Unidade/Caixa) e quantidade; unidade gravada em pedido_itens, no WhatsApp e no painel, total do pedido separado por unidade
- [x] Catálogo personalizado com imagem (upload para o Storage, bucket catalogos) ou emoji de uma lista por tema; personalizado existente pode ser editado (nome, ícone, cor) sem mudar o link
- [x] Migração para Next.js com backend próprio e Postgres da empresa (schema crm); login, pedidos e imagens fora do Supabase
