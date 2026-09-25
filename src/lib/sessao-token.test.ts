// Roda com: bun test
import { expect, test } from "bun:test";
import { SignJWT } from "jose";

import { assinarSessao, cookieSeguro, cookieSeriaDescartado, lerToken } from "./sessao-token";

const SEGREDO = "x".repeat(40);
const SESSAO = {
  sub: "b3d7c1f0-0000-4000-8000-000000000001",
  email: "a@b",
  admin: true,
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
  const vencido = await new SignJWT({ email: "a@b", admin: true, prov: false })
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
