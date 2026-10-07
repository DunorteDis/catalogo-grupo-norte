// Roda com: bun test
import { expect, test } from "bun:test";
import * as X from "xlsx";

import { linhasPlanilha, nomeArquivoPlanilha, planilhaDoPedido } from "./planilha-pedido";

const item = { nome: "Produto", unidade: "UN", porCaixa: null };
const ITENS = [
  { ...item, codigo: "7896064445214", quantidade: 3 },
  { ...item, codigo: "0012345", quantidade: 50 },
];

test("gera um .xls que abre com o layout do modelo 9816-2.xls", () => {
  const bytes = X.write(planilhaDoPedido(X, ITENS), { type: "buffer", bookType: "xls" });
  // Assinatura de arquivo OLE: é Excel 97-2003 de verdade, não xlsx renomeado.
  expect([...bytes.subarray(0, 4)]).toEqual([0xd0, 0xcf, 0x11, 0xe0]);

  const aba = X.read(bytes).Sheets["Pedido"]!;
  expect(X.utils.sheet_to_json(aba, { header: 1 })).toEqual([
    ["Cód.Prod ou EAN", "Qde"],
    ["7896064445214", "3"],
    ["0012345", "50"],
  ]);
  // Texto, como no modelo: o zero à esquerda do código não some.
  expect(aba["A3"]?.t).toBe("s");
  expect(aba["B2"]?.t).toBe("s");
});

test("linhas: vai o código do Winthor; o EAN só quando ele falta", () => {
  expect(
    linhasPlanilha([
      { ...item, codigo: "7896064445214", codprod: 4821, quantidade: 3 },
      { ...item, codigo: "7891000100103", codprod: null, quantidade: 1 },
    ]),
  ).toEqual([
    ["Cód.Prod ou EAN", "Qde"],
    ["4821", "3"],
    ["7891000100103", "1"],
  ]);
});

test("linhas: caixa vai em unidades, pelo qtunitcx", () => {
  expect(
    linhasPlanilha([
      { ...item, codigo: "1", codprod: 10, quantidade: 5, unidade: "CX", porCaixa: 12 },
      { ...item, codigo: "2", codprod: 20, quantidade: 7, unidade: "UN", porCaixa: 24 },
    ]),
  ).toEqual([
    ["Cód.Prod ou EAN", "Qde"],
    ["10", "60"],
    ["20", "7"],
  ]);
});

test("linhas: caixa sem qtunitcx não sai como se fosse unidade", () => {
  expect(() =>
    linhasPlanilha([
      { ...item, codigo: "1", quantidade: 5, unidade: "CX", porCaixa: null, nome: "Arroz 5kg" },
    ]),
  ).toThrow(/QTUNITCX.*Arroz 5kg/);
});

test("linhas: cabeçalho do modelo e uma linha por item", () => {
  expect(linhasPlanilha([])).toEqual([["Cód.Prod ou EAN", "Qde"]]);
  expect(linhasPlanilha(ITENS)).toHaveLength(3);
});

test("nome do arquivo leva cliente e data; sem cliente vira 'cliente'", () => {
  const quando = new Date(2026, 8, 28, 14, 5).toISOString();
  expect(nomeArquivoPlanilha({ cliente_nome: "Maria Sílva", created_at: quando })).toBe(
    "pedido-maria-silva-2026-09-28-14h05.xls",
  );
  expect(nomeArquivoPlanilha({ cliente_nome: null, created_at: quando })).toBe(
    "pedido-cliente-2026-09-28-14h05.xls",
  );
});
