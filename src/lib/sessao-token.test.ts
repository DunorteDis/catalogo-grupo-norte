// Roda com: bun test
import { expect, test } from "bun:test";
import { SignJWT } from "jose";

import {
  areaDe,
  assinarSessao,
  cookieSeguro,
  cookieSeriaDescartado,
  destinoDoAcesso,
  distEmUso,
  lerToken,
} from "./sessao-token";

const SEGREDO = "x".repeat(40);
const SESSAO = {
  sub: "b3d7c1f0-0000-4000-8000-000000000001",
  email: "a@b",
  papel: "admin" as const,
  dist: "d57ec162-19f3-4d5a-9442-6bba5fb30b1e",
  prov: false,
};

test("assina e lê de volta a mesma sessão", async () => {
  expect(await lerToken(await assinarSessao(SESSAO, SEGREDO), SEGREDO)).toEqual(SESSAO);
});

test("token adulterado, de outro segredo ou ausente não vale", async () => {
  const token = await assinarSessao(SESSAO, SEGREDO);
  expect(await lerToken(token.slice(0, -2) + "xx", SEGREDO)).toBeNull();
  expect(await lerToken(token, "y".repeat(40))).toBeNull();
  expect(await lerToken(undefined, SEGREDO)).toBeNull();
});

test("token vencido não vale", async () => {
  const vencido = await new SignJWT({ email: "a@b", papel: "admin", dist: null, prov: false })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(SESSAO.sub)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
    .sign(new TextEncoder().encode(SEGREDO));
  expect(await lerToken(vencido, SEGREDO)).toBeNull();
});

test("segredo curto é erro de configuração, não sessão inválida", async () => {
  await expect(assinarSessao(SESSAO, "curto")).rejects.toThrow("SESSION_SECRET");
  await expect(lerToken("qualquer", "curto")).rejects.toThrow("SESSION_SECRET");
});

test("cookie só é secure em produção, e dá para desligar para HTTP puro", () => {
  expect(cookieSeguro({ NODE_ENV: "production" })).toBe(true);
  expect(cookieSeguro({ NODE_ENV: "production", COOKIE_INSEGURO: "1" })).toBe(false);
  expect(cookieSeguro({ NODE_ENV: "development" })).toBe(false);
  // .env vindo do Windows, com espaço ou escrito "true": continua desligando.
  for (const valor of ["1\r", " 1 ", "true", "TRUE"])
    expect(cookieSeguro({ NODE_ENV: "production", COOKIE_INSEGURO: valor })).toBe(false);
  expect(cookieSeguro({ NODE_ENV: "production", COOKIE_INSEGURO: "0" })).toBe(true);
});

test("login por http:// com cookie secure é recusado em vez de falhar calado", () => {
  const prod = { NODE_ENV: "production" };
  expect(cookieSeriaDescartado("http://172.16.0.20:5015", prod)).toBe(true);
  expect(cookieSeriaDescartado("https://abastex.exemplo.com", prod)).toBe(false);
  expect(cookieSeriaDescartado("http://172.16.0.20:5015", { ...prod, COOKIE_INSEGURO: "1" })).toBe(
    false,
  );
  expect(cookieSeriaDescartado(null, prod)).toBe(false);
});

test("TI sem distribuidora escolhida ida e volta", async () => {
  const ti = { ...SESSAO, papel: "ti" as const, dist: null };
  expect(await lerToken(await assinarSessao(ti, SEGREDO), SEGREDO)).toEqual(ti);
});

test("token de antes da virada (sem papel) é recusado", async () => {
  const antigo = await new SignJWT({ email: "a@b", admin: true, prov: false })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(SESSAO.sub)
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SEGREDO));
  expect(await lerToken(antigo, SEGREDO)).toBeNull();
});

test("areaDe manda cada um para a sua tela", () => {
  expect(areaDe({ papel: "admin", dist: "x", prov: true })).toBe("/definir-senha");
  expect(areaDe({ papel: "ti", dist: null, prov: false })).toBe("/escolher-distribuidora");
  expect(areaDe({ papel: "ti", dist: "x", prov: false })).toBe("/admin");
  expect(areaDe({ papel: "admin", dist: "x", prov: false })).toBe("/admin");
  expect(areaDe({ papel: "vendedor", dist: "x", prov: false })).toBe("/vendedor");
});

test("distEmUso: TI com a distribuidora escolhida desligada volta a escolher", () => {
  // TI: desligada vira nula (vai para a escolha); ligada fica.
  expect(distEmUso({ papel: "ti", dist: "d1", ativa: false })).toBeNull();
  expect(distEmUso({ papel: "ti", dist: "d1", ativa: true })).toBe("d1");
  // Admin e vendedor: é a do cadastro, ligada ou não (quem recusa desligada é o exigirLogin).
  expect(distEmUso({ papel: "admin", dist: "d1", ativa: false })).toBe("d1");
  expect(distEmUso({ papel: "vendedor", dist: null, ativa: false })).toBeNull();
});

test("destinoDoAcesso: sessão que não vale mais volta ao login, sem ciclo com /auth", () => {
  // Conta apagada ou sem papel.
  expect(destinoDoAcesso(null, false)).toBeNull();
  expect(destinoDoAcesso({ papel: null, dist: "d1", ativa: true }, false)).toBeNull();
  // Admin e vendedor com a distribuidora desligada ou sem distribuidora.
  expect(destinoDoAcesso({ papel: "admin", dist: "d1", ativa: false }, false)).toBeNull();
  expect(destinoDoAcesso({ papel: "vendedor", dist: null, ativa: false }, false)).toBeNull();
  // Quem vale segue para a sua área.
  expect(destinoDoAcesso({ papel: "admin", dist: "d1", ativa: true }, false)).toBe("/admin");
  expect(destinoDoAcesso({ papel: "vendedor", dist: "d1", ativa: true }, true)).toBe(
    "/definir-senha",
  );
  expect(destinoDoAcesso({ papel: "ti", dist: "d1", ativa: false }, false)).toBe(
    "/escolher-distribuidora",
  );
  expect(destinoDoAcesso({ papel: "ti", dist: "d1", ativa: true }, false)).toBe("/admin");
});
