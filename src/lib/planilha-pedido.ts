import type * as XLSX from "xlsx";

import { qtdEmUnidades, slugify } from "@/lib/catalogo";

/** `codigo` é o EAN (ou o codprod, se o produto não tem EAN); `codprod`, o código no Winthor. */
type ItemPlanilha = {
  codigo: string;
  codprod?: number | null;
  nome: string;
  quantidade: number;
  unidade: string;
  porCaixa: number | null;
};
type PedidoPlanilha = {
  cliente_nome: string | null;
  created_at: string;
  pedido_itens: ItemPlanilha[];
};

/**
 * Layout do modelo 9816-2.xls, que o sistema de destino importa: uma aba, coluna
 * A "Cód.Prod ou EAN" e B "Qde", uma linha por item, tudo como texto (no modelo
 * as duas colunas são texto; código como texto também preserva zero à esquerda).
 * Vai o código do produto no Winthor; o EAN só quando o item não tem esse código.
 * A Qde vai sempre em unidades: item em caixa é multiplicado pelo qtunitcx do
 * Winthor. Caixa sem qtunitcx não tem como converter, e aí a planilha não sai.
 */
export function linhasPlanilha(itens: ItemPlanilha[]) {
  const semConversao = itens.filter((i) => qtdEmUnidades(i) == null);
  if (semConversao.length)
    throw new Error(
      "Sem quantidade por caixa (QTUNITCX) no Winthor para converter em unidades: " +
        `${semConversao.map((i) => i.nome).join(", ")}. ` +
        "Mude esses itens para unidade e salve antes de exportar.",
    );
  return [
    ["Cód.Prod ou EAN", "Qde"],
    ...itens.map((i) => [
      i.codprod != null ? String(i.codprod) : i.codigo,
      String(qtdEmUnidades(i)),
    ]),
  ];
}

/** pedido-maria-silva-2026-09-28-14h05.xls, na hora local de quem baixa. */
export function nomeArquivoPlanilha(pedido: Pick<PedidoPlanilha, "cliente_nome" | "created_at">) {
  const d = new Date(pedido.created_at);
  const dois = (n: number) => String(n).padStart(2, "0");
  const quando = `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}-${dois(d.getHours())}h${dois(d.getMinutes())}`;
  const cliente = slugify(pedido.cliente_nome ?? "") || "cliente";
  return `pedido-${cliente}-${quando}.xls`;
}

export function planilhaDoPedido(X: typeof XLSX, itens: ItemPlanilha[]) {
  const aba = X.utils.aoa_to_sheet(linhasPlanilha(itens));
  aba["!cols"] = [{ wch: 14.83 }, { wch: 3.5 }]; // larguras do modelo
  const livro = X.utils.book_new();
  X.utils.book_append_sheet(livro, aba, "Pedido");
  return livro;
}

/**
 * Gera e baixa o .xls (Excel 97-2003, o mesmo formato do modelo). O SheetJS só
 * carrega no clique: é pesado e só quem exporta precisa dele.
 */
export async function baixarPlanilhaDoPedido(pedido: PedidoPlanilha) {
  const X = await import("xlsx");
  X.writeFile(planilhaDoPedido(X, pedido.pedido_itens), nomeArquivoPlanilha(pedido), {
    bookType: "xls",
  });
}
