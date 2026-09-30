import { SignJWT, jwtVerify } from "jose";

// Sem next/headers aqui: o proxy também lê o token.

// Nome próprio do app: cookie não separa por porta, e outro sistema no mesmo IP
// (ex.: 172.16.0.20) usando "sessao" derrubaria a sessão daqui e vice-versa.
export const COOKIE_SESSAO = "abastex_sessao";
export const DURACAO_SESSAO_S = 60 * 60 * 24 * 7;

const PAPEIS = ["ti", "admin", "vendedor"] as const;
export type Papel = (typeof PAPEIS)[number];

/** `dist` = distribuidora em uso; nula só no TI que ainda não escolheu. */
export type Sessao = {
  sub: string;
  email: string;
  papel: Papel;
  dist: string | null;
  prov: boolean;
};

function chave(segredo = process.env["SESSION_SECRET"]) {
  if (!segredo || segredo.length < 32)
    throw new Error("SESSION_SECRET ausente ou curta (mínimo 32 caracteres).");
  return new TextEncoder().encode(segredo);
}

export async function assinarSessao(s: Sessao, segredo?: string) {
  return new SignJWT({ email: s.email, papel: s.papel, dist: s.dist, prov: s.prov })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.sub)
    .setIssuedAt()
    .setExpirationTime(`${DURACAO_SESSAO_S}s`)
    .sign(chave(segredo));
}

/**
 * null para token ausente, adulterado, vencido ou de antes do login por
 * distribuidora. Segredo mal configurado lança.
 */
export async function lerToken(
  token: string | undefined,
  segredo?: string,
): Promise<Sessao | null> {
  const k = chave(segredo);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, k, { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    const papel = payload["papel"];
    // Token sem papel é o de antes da virada: entra de novo.
    if (!PAPEIS.includes(papel as Papel)) return null;
    const dist = payload["dist"];
    return {
      sub: payload.sub,
      email: String(payload["email"] ?? ""),
      papel: papel as Papel,
      dist: typeof dist === "string" ? dist : null,
      prov: payload["prov"] === true,
    };
  } catch {
    return null;
  }
}

/**
 * Distribuidora em uso, a partir do que o banco diz. O TI com a escolhida
 * desligada volta a escolher (nula) em vez de ficar numa distribuidora fora do ar;
 * admin e vendedor ficam na do cadastro, e quem recusa desligada é o exigirLogin.
 */
export function distEmUso(a: { papel: Papel; dist: string | null; ativa: boolean }) {
  return a.papel === "ti" && !a.ativa ? null : a.dist;
}

/** Para onde vai quem tem sessão: troca de senha, escolha do TI, ou a própria área. */
export function areaDe(s: Pick<Sessao, "papel" | "dist" | "prov">) {
  if (s.prov) return "/definir-senha";
  if (s.papel === "ti" && !s.dist) return "/escolher-distribuidora";
  return s.papel === "vendedor" ? "/vendedor" : "/admin";
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

/**
 * Para onde vai uma sessão pelo que o banco diz dela (`acessoDe`). null = não vale
 * mais (conta apagada, sem papel, ou admin/vendedor sem distribuidora ligada): volta
 * ao login, e o login diz o porquê. Layout e /auth usam a mesma regra, então um
 * nunca devolve para o outro em ciclo.
 */
export function destinoDoAcesso(
  a: { papel: Papel | null; dist: string | null; ativa: boolean } | null,
  prov: boolean,
) {
  if (!a?.papel) return null;
  if (a.papel !== "ti" && (!a.dist || !a.ativa)) return null;
  return areaDe({ papel: a.papel, dist: distEmUso({ ...a, papel: a.papel }), prov });
}
