"use server";

import bcrypt from "bcryptjs";

import {
  CHAVE_SENHA_PROVISORIA,
  loginParaEmail,
  senhaEhProvisoria,
  senhaFraca,
  usuarioDeEmail,
} from "@/lib/acessos";
import { acao, Recusa } from "@/server/acao";
import { sql } from "@/server/db";
import {
  limparErrosLogin,
  loginBloqueado,
  MAX_ERROS_POR_USUARIO,
  registrarErroLogin,
} from "@/server/freio";
import { apagarSessao, gravarSessao, ipDaRequisicao, lerSessao } from "@/server/sessao";

// Usuário inexistente também paga um bcrypt: o tempo de resposta não pode
// entregar quais usuários existem.
const HASH_FALSO = "$2a$10$69ZGLyCWJgNn5b4KvRZPpOb/YFjnBTW0pFh9BqcUw9qh4qxJQ/DYa";

type Conta = {
  id: string;
  email: string;
  senha_hash: string | null;
  meta: Record<string, unknown> | null;
  admin: boolean;
};

function areaDe(s: { admin: boolean; prov: boolean }) {
  return s.prov ? "/definir-senha" : s.admin ? "/admin" : "/vendedor";
}

export const entrar = acao(async (usuario: string, senha: string) => {
  const email = loginParaEmail(String(usuario ?? ""));
  // Duas chaves: por IP (rápida, mas o cabeçalho só é confiável atrás de proxy —
  // ver ipDaRequisicao) e por usuário (não depende de cabeçalho nenhum, pega
  // quem varia de IP a cada tentativa).
  const agora = Date.now();
  const chaveIp = `${email}|${await ipDaRequisicao()}`;
  if (loginBloqueado(chaveIp, agora) || loginBloqueado(email, agora, MAX_ERROS_POR_USUARIO))
    throw new Recusa("Muitas tentativas erradas. Espere 15 minutos e tente de novo.");

  const [conta] = await sql<Conta[]>`
    select u.id, u.email, u.senha_hash, u.raw_user_meta_data as meta,
           exists (select 1 from user_roles r where r.user_id = u.id and r.role = 'admin') as admin
      from usuarios u
     where lower(u.email) = ${email}`;
  const confere = await bcrypt.compare(String(senha ?? ""), conta?.senha_hash ?? HASH_FALSO);
  if (!conta?.senha_hash || !confere) {
    registrarErroLogin(chaveIp, agora);
    registrarErroLogin(email, agora);
    throw new Recusa("Usuário ou senha incorretos.");
  }

  limparErrosLogin(chaveIp);
  limparErrosLogin(email);
  await sql`update usuarios set last_sign_in_at = now() where id = ${conta.id}`;
  const sessao = {
    sub: conta.id,
    email: conta.email,
    admin: conta.admin,
    prov: senhaEhProvisoria(conta.meta),
  };
  await gravarSessao(sessao);
  return areaDe(sessao);
});

export const sair = acao(async () => {
  await apagarSessao();
});

export const definirSenha = acao(async (senha: string) => {
  // lerSessao, não exigirLogin: quem chega aqui é justamente quem tem senha provisória.
  const s = await lerSessao();
  if (!s) throw new Recusa("Sua sessão expirou. Entre novamente.");
  const nova = String(senha ?? "");
  // A tela já recusa; aqui é a trava de verdade.
  const problema = senhaFraca(nova, usuarioDeEmail(s.email));
  if (problema) throw new Recusa(problema);

  // sql.json, não JSON.stringify+::jsonb — ver o comentário em criarConta (src/server/acessos.ts).
  await sql`
    update usuarios
       set senha_hash = ${await bcrypt.hash(nova, 10)},
           raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                                || ${sql.json({ [CHAVE_SENHA_PROVISORIA]: false })},
           updated_at = now()
     where id = ${s.sub}`;
  const sessao = { ...s, prov: false };
  await gravarSessao(sessao);
  return areaDe(sessao);
});
