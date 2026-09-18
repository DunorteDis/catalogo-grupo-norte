export const FOTO_BASE = "https://api.vmaissistemas.com.br/foto_produtos/";

export function fotoUrl(arquivo?: string | null) {
  if (!arquivo) return null;
  return `${FOTO_BASE}${arquivo}`;
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
