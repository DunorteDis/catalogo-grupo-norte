// Roda com: bun test
import { expect, test } from "bun:test";

import { nomeArquivoCotacao, textoCotacao, totalCotacao, type DadosCotacao } from "./cotacao";

const BASE: DadosCotacao = {
  codigo: "A2342020",
  data: "05/10/2026",
  distribuidora: { nome: "Dunorte Distribuidora", cor: "#e30613" },
  cliente: { nome: "MERCADINHO CEZAR", codcli: 757, cnpj: "03922030000143" },
  vendedor: { nome: "Fulano", whatsapp: "92981219124" },
  itens: [
    {
      nome: "PROT DIARIO",
      codprod: 217930,
      codigo: "7501007499758",
      quantidade: 1,
      unidade: "UN",
      preco: 7.37,
      porCaixa: 24,
    },
    {
      nome: "GILLETTE",
      codprod: 220875,
      codigo: "7500435253680",
      quantidade: 2,
      unidade: "CX",
      preco: 59.93,
      porCaixa: 12,
    },
    {
      nome: "SEM PRECO",
      codprod: 1,
      codigo: "1",
      quantidade: 3,
      unidade: "UN",
      preco: null,
      porCaixa: null,
    },
  ],
};

test("total: unidade pelo preço, caixa pelo preço × unidades da caixa; sem preço fica fora", () => {
  // 7,37 + 2 × 12 × 59,93
  expect(totalCotacao(BASE.itens)).toBeCloseTo(7.37 + 1438.32, 2);
});

test("texto: cabeçalho, itens, total e aviso; condições só quando preenchidas", () => {
  const t = textoCotacao(BASE);
  expect(t).toContain("*Cotação #A2342020*");
  expect(t).toContain("CNPJ 03.922.030/0001-43 · Cód. 757");
  expect(t).toContain("1. PROT DIARIO");
  expect(t).toContain("2 caixas × R$");
  expect(t).toContain("caixa com 12 un.");
  expect(t).toContain("3 unidades · _preço a confirmar_");
  expect(t).toContain("1 item com preço a confirmar");
  expect(t).toContain("Vendedor: Fulano · (92) 98121-9124");
  expect(t).not.toContain("Pagamento");
  expect(textoCotacao({ ...BASE, plano: "Boleto 28 dias" })).toContain(
    "*Pagamento:* Boleto 28 dias",
  );
});

test("nome do arquivo leva o código e o cliente", () => {
  expect(nomeArquivoCotacao(BASE)).toBe("cotacao-A2342020-mercadinho-cezar.pdf");
});
