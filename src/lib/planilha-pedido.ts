import type * as XLSX from "xlsx";

import { slugify } from "@/lib/catalogo";

type ItemPlanilha = { codigo: string; quantidade: number };
type PedidoPlanilha = {
  cliente_nome: string | null;
  created_at: string;
  pedido_itens: ItemPlanilha[];
};

/**
 * Layout do modelo 9816-2.xls, que o sistema de destino importa: uma aba, coluna
 * A "Cód.Prod ou EAN" e B "Qde", uma linha por item, tudo como texto (no modelo
 * as duas colunas são texto; código como texto também preserva zero à esquerda).
 * A unidade (UN/CX) fica de fora de propósito, igual ao modelo — decisão do
 * negócio: quem importa usa a unidade padrão do produto.
 */
export function linhasPlanilha(itens: ItemPlanilha[]) {
  return [["Cód.Prod ou EAN", "Qde"], ...itens.map((i) => [i.codigo, String(i.quantidade)])];
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
