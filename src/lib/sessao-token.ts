import { SignJWT, jwtVerify } from "jose";

// Sem next/headers aqui: o proxy também lê o token.

// Nome próprio do app: cookie não separa por porta, e outro sistema no mesmo IP
// (ex.: 172.16.0.20) usando "sessao" derrubaria a sessão daqui e vice-versa.
export const COOKIE_SESSAO = "abastex_sessao";
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
  // trim: .env salvo no Windows e levado para o servidor chega como "1\r".
  const inseguro = env["COOKIE_INSEGURO"]?.trim().toLowerCase();
  return env["NODE_ENV"] === "production" && inseguro !== "1" && inseguro !== "true";
}

/**
 * Login vindo de uma página http:// com cookie secure: o navegador ia descartar a
 * sessão sem erro nenhum. Melhor recusar o login dizendo o porquê.
 */
export function cookieSeriaDescartado(
  origem: string | null,
  env: Record<string, string | undefined> = process.env,
) {
  return cookieSeguro(env) && !!origem?.startsWith("http://");
}
