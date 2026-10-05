import { formatarDocumento, formatarTelefone, qtdComUnidade } from "@/lib/catalogo";
import {
  AVISO_COTACAO,
  precoPedido,
  totalCotacao,
  totalItem,
  type DadosCotacao,
} from "@/lib/cotacao";
import { formatarReais } from "@/lib/credito";

type RGB = [number, number, number];

const rgb = (cor: string): RGB => {
  const h = cor.replace("#", "").trim();
  const v = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) || 0) as RGB;
};
const misturar = (a: RGB, b: RGB, t: number) =>
  a.map((v, i) => Math.round(v + (b[i]! - v) * t)) as RGB;
const BRANCO: RGB = [255, 255, 255];
const PRETO: RGB = [0, 0, 0];
const TINTA: RGB = [26, 22, 40];
const CINZA: RGB = [107, 104, 120];
/** Cor clara demais para texto branco por cima (luminância percebida). */
const clara = ([r, g, b]: RGB) => (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;

/**
 * PDF da cotação, na cor do catálogo do pedido: faixa de topo com a distribuidora e o
 * número, cartões de cliente e vendedor, a tabela de itens e o total em destaque. O jsPDF
 * só carrega aqui, no clique: é pesado e só quem gera precisa dele.
 */
export async function gerarPdfCotacao(d: DadosCotacao): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;

  const marca = rgb(d.distribuidora?.cor || "#501ea1");
  const sobreMarca = clara(marca) ? TINTA : BRANCO;
  // Texto na cor da marca sobre fundo claro: marca clara demais vira um tom mais escuro.
  const marcaTexto = clara(marca) ? misturar(marca, PRETO, 0.45) : marca;
  const fundoCartao = misturar(marca, BRANCO, 0.9);
  const linhaAlternada = misturar(marca, BRANCO, 0.95);

  // Faixa do topo, com um círculo em tom mais escuro da marca no canto.
  doc.setFillColor(...marca);
  doc.rect(0, 0, W, 120, "F");
  doc.setFillColor(...misturar(marca, PRETO, 0.12));
  doc.circle(W + 20, -10, 120, "F");

  doc.setTextColor(...sobreMarca);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(d.distribuidora?.nome ?? "Cotação", M, 54);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Cotação de pedido", M, 74);
  doc.setFontSize(9);
  doc.text(`Emitida em ${d.data}`, M, 92);

  doc.setFontSize(10);
  doc.text("Cotação nº", W - M, 50, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text(`#${d.codigo}`, W - M, 78, { align: "right" });

  // Cartões de cliente e vendedor.
  let y = 142;
  const larguraCartao = (W - 2 * M - 12) / 2;
  const cartao = (x: number, rotulo: string, nome: string, linhas: string[]) => {
    doc.setFillColor(...fundoCartao);
    doc.roundedRect(x, y, larguraCartao, 82, 10, 10, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...marcaTexto);
    doc.text(rotulo, x + 14, y + 20);
    doc.setFontSize(12);
    doc.setTextColor(...TINTA);
    const nomeLinhas = doc.splitTextToSize(nome, larguraCartao - 28).slice(0, 2) as string[];
    doc.text(nomeLinhas, x + 14, y + 38);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...CINZA);
    doc.text(linhas, x + 14, y + 38 + nomeLinhas.length * 14 + 2);
  };
  cartao(M, "Cliente", d.cliente.nome, [
    [d.cliente.cnpj && `CNPJ ${formatarDocumento(d.cliente.cnpj)}`, `Cód. ${d.cliente.codcli}`]
      .filter(Boolean)
      .join("  ·  "),
  ]);
  cartao(
    M + larguraCartao + 12,
    "Vendedor",
    d.vendedor?.nome ?? "—",
    d.vendedor?.whatsapp ? [`WhatsApp ${formatarTelefone(d.vendedor.whatsapp)}`] : [],
  );
  y += 82 + 12;

  // Entrega e pagamento, quando preenchidos.
  const condicoes = [
    d.entrega || d.tipoEntrega
      ? `Entrega: ${[d.entrega, d.tipoEntrega].filter(Boolean).join(" · ")}`
      : null,
    d.plano ? `Pagamento: ${d.plano}` : null,
  ].filter(Boolean) as string[];
  if (condicoes.length) {
    doc.setFillColor(...fundoCartao);
    doc.roundedRect(M, y, W - 2 * M, 28, 8, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...TINTA);
    doc.text(condicoes.join("      "), M + 14, y + 18);
    y += 28 + 12;
  }

  // Itens.
  autoTable(doc, {
    startY: y + 4,
    margin: { left: M, right: M, bottom: 64 },
    head: [["#", "Produto", "Código", "Quantidade", "Preço", "Total"]],
    body: d.itens.map((i, n) => {
      const preco = precoPedido(i);
      const total = totalItem(i);
      return [
        String(n + 1),
        i.nome,
        i.codprod != null && i.codigo !== String(i.codprod)
          ? `${i.codprod}\nEAN ${i.codigo}`
          : String(i.codprod ?? i.codigo),
        i.unidade === "CX" && i.porCaixa
          ? `${qtdComUnidade(i.quantidade, i.unidade)}\n(${i.porCaixa} un. cada)`
          : qtdComUnidade(i.quantidade, i.unidade),
        preco == null ? "a confirmar" : formatarReais(preco),
        total == null ? "—" : formatarReais(total),
      ];
    }),
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 9,
      textColor: TINTA,
      cellPadding: { top: 7, bottom: 7, left: 6, right: 6 },
      valign: "middle",
    },
    headStyles: { fillColor: marca, textColor: sobreMarca, fontStyle: "bold", fontSize: 9 },
    alternateRowStyles: { fillColor: linhaAlternada },
    columnStyles: {
      0: { cellWidth: 22, halign: "center", textColor: CINZA },
      2: { cellWidth: 84, fontSize: 7.5, textColor: CINZA },
      3: { cellWidth: 74, halign: "right" },
      4: { cellWidth: 70, halign: "right" },
      5: { cellWidth: 78, halign: "right", fontStyle: "bold" },
    },
    didParseCell: (c) => {
      if (c.section === "head" && c.column.index >= 3) c.cell.styles.halign = "right";
      if (c.section === "head" && c.column.index === 0) c.cell.styles.halign = "center";
    },
  });
  y = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y;

  // Total em destaque.
  if (y + 90 > H - 70) {
    doc.addPage();
    y = M;
  }
  y += 16;
  const larguraTotal = 230;
  doc.setFillColor(...marca);
  doc.roundedRect(W - M - larguraTotal, y, larguraTotal, 54, 12, 12, "F");
  doc.setTextColor(...sobreMarca);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text("Total da cotação", W - M - larguraTotal + 16, y + 22);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text(formatarReais(totalCotacao(d.itens)), W - M - 16, y + 40, { align: "right" });
  const semPreco = d.itens.filter((i) => totalItem(i) == null).length;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...CINZA);
  doc.text(
    `${d.itens.length === 1 ? "1 item" : `${d.itens.length} itens`}${
      semPreco ? `, ${semPreco} com preço a confirmar (fora do total)` : ""
    }`,
    M,
    y + 32,
  );
  y += 54;

  if (d.observacao) {
    const texto = doc.splitTextToSize(d.observacao, W - 2 * M) as string[];
    if (y + 40 + texto.length * 12 > H - 70) {
      doc.addPage();
      y = M;
    }
    y += 26;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...marcaTexto);
    doc.text("Observação", M, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...TINTA);
    doc.text(texto, M, y + 15);
  }

  // Rodapé em todas as páginas: o aviso de preço e a paginação.
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setDrawColor(...misturar(marca, BRANCO, 0.7));
    doc.setLineWidth(1);
    doc.line(M, H - 50, W - M, H - 50);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...CINZA);
    doc.text(doc.splitTextToSize(AVISO_COTACAO, W - 2 * M - 70) as string[], M, H - 36);
    doc.text(`Página ${p} de ${paginas}`, W - M, H - 36, { align: "right" });
  }
  return doc.output("blob");
}
