import { cookies, headers } from "next/headers";

import {
  COOKIE_SESSAO,
  DURACAO_SESSAO_S,
  assinarSessao,
  cookieSeguro,
  cookieSeriaDescartado,
  distEmUso,
  lerToken,
  type Papel,
  type Sessao,
} from "@/lib/sessao-token";
import { Recusa } from "@/server/acao";
import { sql } from "@/server/db";

export async function lerSessao() {
  return lerToken((await cookies()).get(COOKIE_SESSAO)?.value);
}

export async function gravarSessao(s: Sessao) {
  if (cookieSeriaDescartado((await headers()).get("origin"))) {
    // O valor exato vai para o log: "undefined" = a variável não chegou ao processo.
    console.error(
      `Login recusado: página em http:// e cookie secure. Defina COOKIE_INSEGURO=1 no .env do servidor ou sirva por HTTPS. Valor recebido: COOKIE_INSEGURO=${JSON.stringify(process.env["COOKIE_INSEGURO"])}`,
    );
    throw new Recusa(
      "Este endereço não tem HTTPS e o servidor exige cookie seguro. Peça ao administrador para definir COOKIE_INSEGURO=1 ou servir por HTTPS.",
    );
  }
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

type Contexto = { sub: string; email: string; papel: Papel; dist: string | null };

/**
 * Papel e distribuidora da conta, lidos do banco. Papel: TI vale mais que admin,
 * que vale mais que vendedor. A distribuidora do TI é a que ele escolheu (vem do
 * token); a dos outros é a do cadastro. `ativa` diz se ela está ligada.
 */
export async function acessoDe(usuarioId: string, escolhida: string | null) {
  const [a] = await sql<{ papel: Papel | null; dist: string | null; ativa: boolean | null }[]>`
    with u as (
      select u.distribuidora_id,
             case when exists (select 1 from user_roles r where r.user_id = u.id and r.role = 'ti') then 'ti'
                  when exists (select 1 from user_roles r where r.user_id = u.id and r.role = 'admin') then 'admin'
                  when exists (select 1 from user_roles r where r.user_id = u.id and r.role = 'vendedor') then 'vendedor'
             end as papel
        from usuarios u where u.id = ${usuarioId})
    select u.papel, d.id as dist, d.ativo as ativa
      from u left join distribuidoras d
        on d.id = case when u.papel = 'ti' then ${escolhida}::uuid else u.distribuidora_id end`;
  return a ? { papel: a.papel, dist: a.dist, ativa: !!a.ativa } : null;
}

/** Confere no banco a cada chamada: mudar papel, distribuidora ou desligá-la vale na hora. */
export async function exigirLogin(): Promise<Contexto> {
  const s = await lerSessao();
  if (!s) throw new Recusa("Sua sessão expirou. Entre novamente.");
  // Senha provisória trafegou por WhatsApp: nada além da troca de senha.
  if (s.prov) throw new Recusa("Defina sua senha antes de continuar.");
  const a = await acessoDe(s.sub, s.dist);
  if (!a?.papel) throw new Recusa("Sua sessão expirou. Entre novamente.");
  // TI com a distribuidora escolhida desligada volta a escolher, não fica trancado.
  if (a.papel === "ti")
    return {
      sub: s.sub,
      email: s.email,
      papel: a.papel,
      dist: distEmUso({ ...a, papel: a.papel }),
    };
  if (!a.dist) throw new Recusa("Seu acesso não está ligado a uma distribuidora. Fale com o TI.");
  if (!a.ativa) throw new Recusa("Sua distribuidora está desativada. Fale com o TI.");
  return { sub: s.sub, email: s.email, papel: a.papel, dist: a.dist };
}

/** Admin ou TI, sempre dentro de uma distribuidora: é por ela que tudo se filtra. */
export async function exigirAdmin() {
  const s = await exigirLogin();
  if (s.papel === "vendedor") throw new Recusa("Apenas administradores podem fazer isso.");
  if (!s.dist) throw new Recusa("Escolha uma distribuidora para continuar.");
  return { ...s, dist: s.dist };
}

export async function exigirTI() {
  const s = await exigirLogin();
  if (s.papel !== "ti") throw new Recusa("Apenas o TI pode fazer isso.");
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
