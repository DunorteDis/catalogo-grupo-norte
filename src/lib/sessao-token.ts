import { SignJWT, jwtVerify } from "jose";

// Sem next/headers aqui: o proxy também lê o token.

export const COOKIE_SESSAO = "sessao";
export const DURACAO_SESSAO_S = 60 * 60 * 24 * 7;

export type Sessao = { sub: string; email: string; admin: boolean; prov: boolean };

function chave(segredo = process.env["SESSION_SECRET"]) {
  if (!segredo || segredo.length < 32)
    throw new Error("SESSION_SECRET ausente ou curta (mínimo 32 caracteres).");
  return new TextEncoder().encode(segredo);
}

export async function assinarSessao(s: Sessao, segredo?: string) {
  return new SignJWT({ email: s.email, admin: s.admin, prov: s.prov })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.sub)
    .setIssuedAt()
    .setExpirationTime(`${DURACAO_SESSAO_S}s`)
    .sign(chave(segredo));
}

/** null para token ausente, adulterado ou vencido. Segredo mal configurado lança. */
export async function lerToken(
  token: string | undefined,
  segredo?: string,
): Promise<Sessao | null> {
  const k = chave(segredo);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, k, { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    return {
      sub: payload.sub,
      email: String(payload["email"] ?? ""),
      admin: payload["admin"] === true,
      prov: payload["prov"] === true,
    };
  } catch {
    return null;
  }
}

/**
 * Cookie secure em produção. Servido por HTTP puro (IP interno, sem HTTPS), o
 * navegador descarta cookie secure e o login falha calado: COOKIE_INSEGURO=1.
 */
export function cookieSeguro(env: Record<string, string | undefined> = process.env) {
  return env["NODE_ENV"] === "production" && env["COOKIE_INSEGURO"] !== "1";
}
