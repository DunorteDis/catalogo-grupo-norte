// Roda com: bun test
import { expect, test } from "bun:test";

import { formatarReais, resumoCredito, situacaoTitulo } from "./credito";

test("formatarReais usa o real com vírgula e ponto de milhar", () => {
  expect(formatarReais(1234.5).replace(/\s/g, " ")).toBe("R$ 1.234,50");
});

test("situacaoTitulo separa vencido, vence em até 7 dias e em dia", () => {
  expect(situacaoTitulo(12)).toEqual({ tom: "vencido", texto: "Vencido há 12 dias" });
  expect(situacaoTitulo(1)).toEqual({ tom: "vencido", texto: "Vencido há 1 dia" });
  expect(situacaoTitulo(0)).toEqual({ tom: "vence", texto: "Vence hoje" });
  expect(situacaoTitulo(-7)).toEqual({ tom: "vence", texto: "Vence em 7 dias" });
  expect(situacaoTitulo(-8)).toEqual({ tom: "em-dia", texto: "Vence em 8 dias" });
});

test("resumoCredito soma em aberto e vencido e calcula o limite livre", () => {
  const r = resumoCredito(1000, [
    { saldo: 300, diasAtraso: 10 },
    { saldo: 200, diasAtraso: 40 },
    { saldo: 100, diasAtraso: -5 },
  ]);
  expect(r).toEqual({
    emAberto: 600,
    vencido: 500,
    qtdVencidos: 2,
    maiorAtraso: 40,
    livre: 400,
    uso: 0.6,
  });
  expect(resumoCredito(0, []).uso).toBe(0);
  expect(resumoCredito(0, []).maiorAtraso).toBe(0);
});
