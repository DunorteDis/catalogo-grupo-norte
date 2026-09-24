import { cookies, headers } from "next/headers";

import {
  COOKIE_SESSAO,
  DURACAO_SESSAO_S,
  assinarSessao,
  cookieSeguro,
  lerToken,
  type Sessao,
} from "@/lib/sessao-token";
import { Recusa } from "@/server/acao";
import { sql } from "@/server/db";

export async function lerSessao() {
  return lerToken((await cookies()).get(COOKIE_SESSAO)?.value);
}

export async function gravarSessao(s: Sessao) {
  (await cookies()).set(COOKIE_SESSAO, await assinarSessao(s), {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSeguro(),
    path: "/",
    maxAge: DURACAO_SESSAO_S,
  });
}

export async function apagarSessao() {
  (await cookies()).delete(COOKIE_SESSAO);
}

export async function exigirLogin() {
  const s = await lerSessao();
  if (!s) throw new Recusa("Sua sessão expirou. Entre novamente.");
  // Senha provisória trafegou por WhatsApp: nada além da troca de senha.
  if (s.prov) throw new Recusa("Defina sua senha antes de continuar.");
  return s;
}

/** Confere no banco a cada chamada: admin rebaixado perde o acesso na hora, como no RLS. */
export async function exigirAdmin() {
  const s = await exigirLogin();
  const [papel] = await sql`
    select 1 from user_roles where user_id = ${s.sub} and role = 'admin'`;
  if (!papel) throw new Recusa("Apenas administradores podem fazer isso.");
  return s;
}

/**
 * IP do cliente atrás do proxy reverso. Vazio quando não há cabeçalho (dev local).
 *
 * Pressupõe que o deploy roda atrás de um proxy reverso de confiança que
 * sobrescreve (ou define) X-Forwarded-For/X-Real-IP. Sem isso, o cabeçalho vem
 * direto do navegador e qualquer um pode mandar outro valor a cada tentativa —
 * o freio por IP em auth.ts vira só um agrupador de rajada, não uma trava de
 * verdade; por isso existe também o teto por usuário (MAX_ERROS_POR_USUARIO em
 * freio.ts), que não depende de cabeçalho nenhum.
 */
export async function ipDaRequisicao() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || (h.get("x-real-ip") ?? "");
}
