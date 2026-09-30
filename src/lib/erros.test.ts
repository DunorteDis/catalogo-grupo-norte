// Roda com: bun test
import { expect, test } from "bun:test";

import { ErroAcao } from "@/lib/chamar";
import { mensagemErro } from "./erros";

test("ErroAcao mostra a mensagem do servidor como está, mesmo sem acento", () => {
  const erro = new ErroAcao("Muitas tentativas erradas. Espere 15 minutos e tente de novo.");
  expect(mensagemErro(erro, "outro texto")).toBe(
    "Muitas tentativas erradas. Espere 15 minutos e tente de novo.",
  );
});

test("erro cru sem mapeamento cai no padrão informado", () => {
  expect(mensagemErro(new Error("something failed"), "Não foi possível continuar.")).toBe(
    "Não foi possível continuar.",
  );
});

test("erro cru de chave duplicada é traduzido", () => {
  expect(mensagemErro(new Error("duplicate key value violates unique constraint"))).toBe(
    "Esse registro já existe. Verifique os dados informados.",
  );
});
