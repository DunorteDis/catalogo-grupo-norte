// Roda com: bun test
import { expect, test } from "bun:test";

import { limparErrosLogin, loginBloqueado, registrarErroLogin } from "./freio";

const T0 = 1_000_000;
const MIN = 60_000;

test("bloqueia no quinto erro, não antes", () => {
  for (let i = 0; i < 4; i++) registrarErroLogin("a", T0);
  expect(loginBloqueado("a", T0)).toBe(false);
  registrarErroLogin("a", T0);
  expect(loginBloqueado("a", T0)).toBe(true);
});

test("uma chave não bloqueia outra", () => {
  for (let i = 0; i < 5; i++) registrarErroLogin("b", T0);
  expect(loginBloqueado("c", T0)).toBe(false);
});

test("libera depois de 15 minutos", () => {
  for (let i = 0; i < 5; i++) registrarErroLogin("d", T0);
  expect(loginBloqueado("d", T0 + 14 * MIN)).toBe(true);
  expect(loginBloqueado("d", T0 + 16 * MIN)).toBe(false);
});

test("login certo zera a contagem", () => {
  for (let i = 0; i < 4; i++) registrarErroLogin("e", T0);
  limparErrosLogin("e");
  registrarErroLogin("e", T0);
  expect(loginBloqueado("e", T0)).toBe(false);
});
