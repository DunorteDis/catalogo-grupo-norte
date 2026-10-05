import { formatarDocumento, formatarTelefone, qtdComUnidade, slugify } from "@/lib/catalogo";
import { formatarReais } from "@/lib/credito";

export type ItemCotacao = {
  nome: string;
  /** Código do produto no Winthor; nulo quando o item não achou o produto. */
  codprod: number | null;
  /** EAN, ou o próprio codprod quando o produto não tem EAN. */
  codigo: string;
  quantidade: number;
  unidade: string;
  /** Preço de tabela da unidade de venda; nulo sem preço na região do cliente. */
  preco: number | null;
  /** Unidades de venda na caixa master (qtunitcx). */
  porCaixa: number | null;
};

export type DadosCotacao = {
  /** Código do pedido, o mesmo da mensagem do catálogo: "A2342020". */
  codigo: string;
  /** dd/mm/aaaa. */
  data: string;
  distribuidora: { nome: string; cor: string } | null;
  cliente: { nome: string; codcli: number; cnpj: string | null };
  vendedor: { nome: string; whatsapp: string | null } | null;
  itens: ItemCotacao[];
  entrega?: string;
  tipoEntrega?: string;
  plano?: string;
  observacao?: string;
};

/** Preço do que foi pedido: a unidade de venda, ou a caixa (qtunitcx unidades). */
export function precoPedido(i: ItemCotacao) {
  if (i.preco == null) return null;
  if (i.unidade !== "CX") return i.preco;
  return i.porCaixa ? i.preco * i.porCaixa : null;
}

export function totalItem(i: ItemCotacao) {
  const p = precoPedido(i);
  return p == null ? null : p * i.quantidade;
}

export function totalCotacao(itens: ItemCotacao[]) {
  return itens.reduce((soma, i) => soma + (totalItem(i) ?? 0), 0);
}

export const AVISO_COTACAO =
  "Preços de tabela, sem desconto, válidos na data da cotação. Sujeitos a confirmação no fechamento do pedido.";

/** "cotacao-A2342020-mercadinho-cezar.pdf". */
export function nomeArquivoCotacao(d: Pick<DadosCotacao, "codigo" | "cliente">) {
  return `cotacao-${d.codigo}-${slugify(d.cliente.nome) || "cliente"}.pdf`;
}

/**
 * Cotação em texto para o WhatsApp: negrito com *, itálico com _, um item por bloco e o
 * total destacado. Item sem preço na tabela sai como "preço a confirmar" e fica fora do total.
 */
export function textoCotacao(d: DadosCotacao) {
  const l: string[] = [];
  l.push(`🧾 *Cotação #${d.codigo}*`);
  l.push(`${d.distribuidora ? `${d.distribuidora.nome} · ` : ""}${d.data}`);
  l.push("");
  l.push(`👤 *Cliente:* ${d.cliente.nome}`);
  l.push(
    `${d.cliente.cnpj ? `CNPJ ${formatarDocumento(d.cliente.cnpj)} · ` : ""}Cód. ${d.cliente.codcli}`,
  );
  l.push("");
  l.push(`📦 *Itens (${d.itens.length})*`);
  d.itens.forEach((i, n) => {
    const preco = precoPedido(i);
    const total = totalItem(i);
    l.push(`${n + 1}. ${i.nome}`);
    l.push(
      preco == null
        ? `   ${qtdComUnidade(i.quantidade, i.unidade)} · _preço a confirmar_`
        : `   ${qtdComUnidade(i.quantidade, i.unidade)} × ${formatarReais(preco)} = *${formatarReais(total!)}*`,
    );
    if (i.unidade === "CX" && i.porCaixa && i.preco != null)
      l.push(`   _caixa com ${i.porCaixa} un. de ${formatarReais(i.preco)}_`);
    if (i.codprod != null) l.push(`   Cód. ${i.codprod}`);
  });
  l.push("");
  l.push(`💰 *Total: ${formatarReais(totalCotacao(d.itens))}*`);
  const semPreco = d.itens.filter((i) => totalItem(i) == null).length;
  if (semPreco)
    l.push(
      `_${semPreco === 1 ? "1 item com preço a confirmar" : `${semPreco} itens com preço a confirmar`}, fora do total._`,
    );

  const condicoes = [
    d.entrega || d.tipoEntrega
      ? `🚚 *Entrega:* ${[d.entrega, d.tipoEntrega].filter(Boolean).join(" · ")}`
      : null,
    d.plano ? `💳 *Pagamento:* ${d.plano}` : null,
    d.observacao ? `📝 *Observação:* ${d.observacao}` : null,
  ].filter(Boolean);
  if (condicoes.length) {
    l.push("");
    l.push(...(condicoes as string[]));
  }

  l.push("");
  l.push(`_${AVISO_COTACAO}_`);
  if (d.vendedor)
    l.push(
      `Vendedor: ${d.vendedor.nome}${d.vendedor.whatsapp ? ` · ${formatarTelefone(d.vendedor.whatsapp)}` : ""}`,
    );
  return l.join("\n");
}
