# Catálogo de produtos com pedido por WhatsApp

Sistema onde o vendedor envia um link personalizado ao cliente. O cliente escolhe produtos e quantidades e, ao concluir, o pedido vai por WhatsApp direto para o número daquele vendedor.

## Como vai funcionar

### Área do cliente (link do vendedor)
- O link já abre o catálogo da distribuidora escolhida, com a logo e a cor dela no topo.
- Busca por nome ou código do produto, lista com foto, rolagem contínua (carrega mais conforme desce).
- Botão de adicionar com quantidade (+/−) em cada produto.
- Carrinho fixo mostrando total de itens; tela de revisão para ajustar quantidades e remover itens.
- Campo opcional para nome do cliente e observação.
- Botão "Concluir pedido": abre o WhatsApp do vendedor que enviou o link, com a lista formatada (código, nome, quantidade).
- Sem preços, conforme combinado.
- Feito para celular primeiro.

### Área administrativa (login)
- Login por e-mail e senha.
- **Produtos**: importar a lista enviada (7.248 produtos) e depois cadastrar, editar, ativar/desativar produtos manualmente.
- **Distribuidoras**: cadastrar as 6 marcas (Mixnorte, Dunorte, Elonorte, Metanorte, Rotanorte, Supergiro) com logo e cor, e escolher quais produtos entram no catálogo de cada uma.
- **Vendedores**: cadastrar nome, distribuidora e número de WhatsApp; o sistema gera o link pronto para o vendedor copiar e enviar.
- **Pedidos**: registro de cada pedido concluído (produtos, quantidades, cliente, vendedor, data), para acompanhamento.

## Imagens dos produtos
As fotos vêm de `https://api.vmaissistemas.com.br/foto_produtos/{ARQUIVO}`. Produtos sem foto mostram um espaço neutro com o nome.

## Visual
Base clara e limpa, tipografia forte, cartões de produto com foto grande. A cor principal de cada página muda conforme a distribuidora do link (azul-marinho, vermelho, roxo, verde, azul, laranja).

## Detalhes técnicos
- Lovable Cloud (banco + login) para distribuidoras, vendedores, produtos e pedidos.
- Rota pública `/c/$slugVendedor` (catálogo) — leitura pública apenas dos dados necessários; admin protegido em `/_authenticated`.
- Importação do `produtos.txt` (código, nome, arquivo) para a tabela de produtos.
- Envio via `https://wa.me/<numero>?text=<pedido>`; pedido gravado no banco antes de abrir o WhatsApp.
- Logos enviadas ficam como imagens do app (CDN), usadas como padrão de cada distribuidora.

## Primeira entrega
Banco, importação dos produtos, admin (distribuidoras, vendedores, produtos, pedidos) e catálogo público com carrinho e envio por WhatsApp.
