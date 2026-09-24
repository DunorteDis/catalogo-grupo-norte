// Roda com: bun test
import { expect, test } from "bun:test";
import { z } from "zod";

import { acao, Recusa } from "./acao";

test("Recusa volta com a mensagem original", async () => {
  const fn = acao(async () => {
    throw new Recusa("Recusado.");
  });
  expect(await fn()).toEqual({ erro: "Recusado." });
});

test("ZodError volta com a mensagem do primeiro issue", async () => {
  const schema = z.object({ nome: z.string().min(1, "Dê um nome.") });
  const fn = acao(async () => schema.parse({ nome: "" }));
  expect(await fn()).toEqual({ erro: "Dê um nome." });
});

test("erro com code 23505 (chave duplicada) volta com o texto de registro já existente, mesmo com mensagem crua em português", async () => {
  const fn = acao(async () => {
    throw Object.assign(
      new Error('chave duplicada viola a restrição de unicidade "usuarios_email_key"'),
      { code: "23505" },
    );
  });
  expect(await fn()).toEqual({ erro: "Esse registro já existe. Verifique os dados informados." });
});

test("erro com code 23503 (chave estrangeira) volta com o texto de registro ligado a outros dados, mesmo com mensagem crua em português", async () => {
  const fn = acao(async () => {
    throw Object.assign(
      new Error('chave estrangeira viola a restrição "pedidos_vendedor_id_fkey"'),
      { code: "23503" },
    );
  });
  expect(await fn()).toEqual({
    erro: "Esse registro está ligado a outros dados e não pode ser removido.",
  });
});

test("erro cru com acento e sem code conhecido não vaza: cai no texto genérico", async () => {
  const fn = acao(async () => {
    throw new Error('relação "usuarios" não existe');
  });
  expect(await fn()).toEqual({ erro: "Algo deu errado. Tente novamente." });
});

test("sucesso volta como dados", async () => {
  const fn = acao(async () => 42);
  expect(await fn()).toEqual({ dados: 42 });
});
