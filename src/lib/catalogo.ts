export const FOTO_BASE = "https://api.vmaissistemas.com.br/foto_produtos/";

/**
 * Foto do produto: o cadastro que vem do ERP guarda só o nome do arquivo, mas
 * produto cadastrado na mão pode apontar para qualquer imagem da internet —
 * quem já é link fica como está.
 */
export function fotoUrl(arquivo?: string | null) {
  const valor = arquivo?.trim();
  if (!valor) return null;
  if (/^https?:\/\//i.test(valor)) return valor;
  return `${FOTO_BASE}${valor}`;
}

export function somenteDigitos(valor: string) {
  return (valor || "").replace(/\D/g, "");
}

/** Normaliza para o formato aceito pelo WhatsApp (com DDI 55). */
export function whatsappNumero(valor: string) {
  let n = somenteDigitos(valor);
  if (n.length <= 11) n = `55${n}`;
  return n;
}

export function slugify(valor: string) {
  return (valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Quantos códigos colados de uma vez o painel aceita processar. */
export const MAX_CODIGOS_COLADOS = 2000;

/** Palavras que a busca leva em conta; o resto é ruído e só custa consulta. */
export const MAX_PALAVRAS_BUSCA = 6;

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

/**
 * Códigos colados de planilha, do ERP ou de uma lista de WhatsApp. Aceita
 * qualquer separador (quebra de linha, vírgula, ponto e vírgula, tab, aspas) e
 * devolve na ordem em que apareceram, sem repetir.
 */
export function parseCodigos(texto: string) {
  const vistos = new Set<string>();
  // ponytail: Set ja guarda a ordem de insercao, entao dedupe e ordem saem juntos.
  for (const bruto of (texto || "").split(/[^A-Za-z0-9._-]+/)) {
    if (bruto) vistos.add(bruto);
  }
  return [...vistos];
}

/**
 * Uma linha do cadastro por código colado. O banco espelha o ERP linha a linha,
 * então o mesmo EAN pode ter mais de uma: fica a que já está no catálogo — senão
 * colar de novo, para mudar de seção, poria um segundo card do mesmo produto —
 * e, na falta dela, a primeira que veio (o chamador manda da mais antiga).
 */
export function umCadastroPorCodigo(
  linhas: Array<{ id: string; codigo: string; noCatalogo: boolean }>,
) {
  const achados = new Map<string, string>();
  // ponytail: sort é estável, então quem está no catálogo sobe e o resto mantém a ordem.
  for (const l of [...linhas].sort((a, b) => Number(b.noCatalogo) - Number(a.noCatalogo))) {
    if (!achados.has(l.codigo)) achados.set(l.codigo, l.id);
  }
  return { achados, repetidos: linhas.length - achados.size };
}

/** Unidades que o cliente escolhe ao lado da quantidade. `valor` é o que vai para o banco. */
export const UNIDADES = [
  { valor: "UN", nome: "Unidade", plural: "unidades" },
  { valor: "CX", nome: "Caixa", plural: "caixas" },
] as const;

export type Unidade = (typeof UNIDADES)[number]["valor"];

/** "1 caixa", "12 unidades". Unidade desconhecida sai crua em vez de sumir do pedido. */
export function qtdComUnidade(quantidade: number, unidade: string) {
  const u = UNIDADES.find((x) => x.valor === unidade);
  if (!u) return `${quantidade} ${unidade}`;
  return `${quantidade} ${quantidade === 1 ? u.nome.toLowerCase() : u.plural}`;
}

export type ItemCarrinho = {
  produto_id: string;
  codigo: string;
  nome: string;
  arquivo: string | null;
  quantidade: number;
  unidade: Unidade;
};

/**
 * "3 unidades e 7 caixas". Somar caixa com unidade não diz nada a ninguém, então
 * o total do pedido sai separado por unidade — na barra do carrinho e no WhatsApp.
 */
export function totalPorUnidade(itens: Pick<ItemCarrinho, "quantidade" | "unidade">[]) {
  return UNIDADES.map((u) => ({
    valor: u.valor,
    qtd: itens.filter((i) => i.unidade === u.valor).reduce((s, i) => s + i.quantidade, 0),
  }))
    .filter((t) => t.qtd > 0)
    .map((t) => qtdComUnidade(t.qtd, t.valor))
    .join(" e ");
}

export function montarMensagem(opts: {
  distribuidora: string;
  clienteNome?: string;
  observacao?: string;
  itens: ItemCarrinho[];
}) {
  const linhas: string[] = [];
  linhas.push(`*Novo pedido - ${opts.distribuidora}*`);
  if (opts.clienteNome?.trim()) linhas.push(`Cliente: ${opts.clienteNome.trim()}`);
  linhas.push("");
  opts.itens.forEach((item, i) => {
    linhas.push(`${i + 1}. ${item.nome}`);
    linhas.push(`   Cód: ${item.codigo} — Qtd: ${qtdComUnidade(item.quantidade, item.unidade)}`);
  });
  linhas.push("");
  linhas.push(`Total: ${totalPorUnidade(opts.itens)}`);
  if (opts.observacao?.trim()) {
    linhas.push("");
    linhas.push(`Observação: ${opts.observacao.trim()}`);
  }
  return linhas.join("\n");
}

/** Tamanho das páginas. Servidor e tela precisam do mesmo número. */
export const PAGINA_VITRINE = 24;
export const PAGINA_PRODUTOS = 30;
export const PAGINA_CATALOGO = 25;

/** Imagem do catálogo personalizado. SVG fica de fora: aberto direto no navegador, roda script. */
export const TIPOS_IMAGEM = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const MAX_IMAGEM = 2 * 1024 * 1024;
