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
 * Filtros de busca do PostgREST, um por palavra digitada. Cada palavra precisa
 * aparecer no nome ou no código, e as chamadas de `.or()` se somam com E — é
 * isso que faz "gillette carvao" achar "AP BARB GILLETTE PRESTO3 CARVAO ATV",
 * que o ILIKE do texto inteiro perdia por causa do PRESTO3 no meio.
 *
 * Normalizar aqui também é o que protege a consulta: vírgula, parênteses e `*`
 * são sintaxe do PostgREST e iam direto para dentro do filtro.
 */
export function filtrosBusca(texto: string) {
  const palavras = slugify(texto).split("-").filter(Boolean);
  return [...new Set(palavras)]
    .slice(0, MAX_PALAVRAS_BUSCA)
    .map((palavra) => `nome.ilike.%${palavra}%,codigo.ilike.%${palavra}%`);
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

export type ItemCarrinho = {
  produto_id: string;
  codigo: string;
  nome: string;
  arquivo: string | null;
  quantidade: number;
};

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
    linhas.push(`   Cód: ${item.codigo} — Qtd: ${item.quantidade}`);
  });
  linhas.push("");
  linhas.push(`Total de itens: ${opts.itens.reduce((s, i) => s + i.quantidade, 0)}`);
  if (opts.observacao?.trim()) {
    linhas.push("");
    linhas.push(`Observação: ${opts.observacao.trim()}`);
  }
  return linhas.join("\n");
}
