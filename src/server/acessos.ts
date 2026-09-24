"use server";

import bcrypt from "bcryptjs";
import type { JSONValue, TransactionSql } from "postgres";
import { z } from "zod";

import {
  ALFABETO_SENHA,
  USUARIO_MAX,
  USUARIO_MIN,
  USUARIO_REGEX,
  emailDeUsuario,
  gerarSenha,
  normalizarUsuario,
  sortear,
  usuarioDeEmail,
  usuarioDeNome,
} from "@/lib/acessos";
import { slugify, somenteDigitos } from "@/lib/catalogo";
import { acao, Recusa } from "@/server/acao";
import { sql } from "@/server/db";
import { exigirAdmin } from "@/server/sessao";

type Meta = Record<string, unknown>;
type Vendedor = {
  id: string;
  nome: string;
  slug: string;
  whatsapp: string;
  ativo: boolean;
  user_id: string | null;
  created_at: string;
};

/**
 * Com `usuario` informado, respeita a escolha e falha se estiver em uso — quem
 * digitou precisa saber, e não receber um "fulano2" por baixo dos panos. Sem ele
 * (vendedor órfão, que não tem formulário), sugere a partir do nome e incrementa.
 *
 * Quem decide o conflito é o índice único em lower(email), não uma consulta
 * prévia: entre olhar e inserir cabe outra criação com o mesmo usuário. O
 * `on conflict do nothing` deixa tentar de novo sem abortar a transação.
 */
async function criarConta(
  tx: TransactionSql,
  opts: { nome: string; usuario?: string | undefined; emailContato?: string | undefined },
) {
  const escolhido = opts.usuario ? normalizarUsuario(opts.usuario) : null;
  const base = escolhido ?? usuarioDeNome(opts.nome);
  const tentativas = escolhido ? 1 : 25;
  const senha = gerarSenha();
  const hash = await bcrypt.hash(senha, 10);

  for (let i = 0; i < tentativas; i++) {
    const usuario = i === 0 ? base : `${base}${i + 1}`;
    const meta: Meta = {
      nome: opts.nome.trim(),
      usuario,
      // a senha foi ditada/colada no WhatsApp: vale só até o primeiro acesso
      senha_provisoria: true,
      ...(opts.emailContato ? { email_contato: opts.emailContato } : {}),
    };
    // sql.json, não JSON.stringify: com ::jsonb, postgres.js serializa o parâmetro de
    // novo e grava a string escapada como valor — o jsonb vira uma string, não um
    // objeto, e senhaEhProvisoria() (que faz metadata?.[chave]) para de enxergar a flag.
    // Meta é Record<string, unknown>, mas os valores aqui são sempre JSON-serializáveis
    // (string/boolean); o cast só destrava o tipo genérico do sql.json.
    const [conta] = await tx<{ id: string }[]>`
      insert into usuarios (email, raw_user_meta_data, senha_hash, email_confirmed_at)
      values (${emailDeUsuario(usuario)}, ${tx.json(meta as unknown as JSONValue)}, ${hash}, now())
      on conflict do nothing
      returning id`;
    if (conta) return { id: conta.id, usuario, senha };
    if (escolhido) throw new Recusa(`Já existe alguém com o usuário "${escolhido}". Escolha outro.`);
  }
  throw new Recusa("Não foi possível gerar um usuário livre para esse nome.");
}

export const listarAcessos = acao(async () => {
  await exigirAdmin();
  const [contas, vendedores] = await Promise.all([
    sql<{ id: string; email: string | null; meta: Meta | null; created_at: string; admin: boolean }[]>`
      select u.id, u.email, u.raw_user_meta_data as meta, u.created_at,
             exists (select 1 from user_roles r where r.user_id = u.id and r.role = 'admin') as admin
        from usuarios u order by u.created_at`,
    sql<Vendedor[]>`
      select id, nome, slug, whatsapp, ativo, user_id, created_at from vendedores order by nome`,
  ]);
  const porUsuario = new Map(
    vendedores.flatMap((v) => (v.user_id ? [[v.user_id, v] as const] : [])),
  );

  const linhas = contas.map((u) => {
    const meta = u.meta ?? {};
    const vendedor = porUsuario.get(u.id) ?? null;
    return {
      usuarioId: u.id as string | null,
      usuario: (meta["usuario"] as string) ?? usuarioDeEmail(u.email ?? ""),
      nome: vendedor?.nome ?? (meta["nome"] as string) ?? "",
      emailContato: (meta["email_contato"] as string) ?? "",
      criadoEm: u.created_at as string | null,
      admin: u.admin,
      vendedor: vendedor as Vendedor | null,
    };
  });

  // Inclui vendedores sem user_id: sem isso um vendedor órfão sumiria da
  // administração e não haveria por onde devolver o acesso dele.
  const semAcesso = vendedores
    .filter((v) => !v.user_id)
    .map((v) => ({
      usuarioId: null as string | null,
      usuario: "",
      nome: v.nome,
      emailContato: "",
      criadoEm: v.created_at as string | null,
      admin: false,
      vendedor: v as Vendedor | null,
    }));

  return [...linhas, ...semAcesso];
});

const novoAcesso = z.object({
  tipo: z.enum(["vendedor", "admin"]),
  nome: z.string().min(2, "Informe o nome."),
  usuario: z
    .string()
    .min(USUARIO_MIN, `O usuário precisa de ao menos ${USUARIO_MIN} caracteres.`)
    .max(USUARIO_MAX, `O usuário passa de ${USUARIO_MAX} caracteres.`)
    .regex(USUARIO_REGEX, "Use apenas letras, números e ponto — por exemplo, primeiro.ultimo."),
  email: z.string().email("E-mail inválido.").optional().or(z.literal("")),
  whatsapp: z.string().optional().or(z.literal("")),
});

export const criarAcesso = acao(async (entrada: z.input<typeof novoAcesso>) => {
  await exigirAdmin();
  const data = novoAcesso.parse(entrada);
  const tel = somenteDigitos(data.whatsapp ?? "");
  if (data.tipo === "vendedor" && tel.length < 10)
    throw new Recusa("Informe o WhatsApp do vendedor, com DDD.");

  // Transação: vendedor que falha não deixa login solto para trás.
  return sql.begin(async (tx) => {
    const conta = await criarConta(tx, {
      nome: data.nome,
      usuario: data.usuario,
      emailContato: data.email || undefined,
    });
    await tx`
      insert into user_roles (user_id, role) values (${conta.id}, ${data.tipo})
      on conflict (user_id, role) do nothing`;
    if (data.tipo === "vendedor") {
      const slug = `${slugify(data.nome)}-${sortear(ALFABETO_SENHA, 4).join("")}`;
      await tx`
        insert into vendedores (nome, slug, whatsapp, user_id)
        values (${data.nome.trim()}, ${slug}, ${tel}, ${conta.id})`;
    }
    return { nome: data.nome.trim(), usuario: conta.usuario, senha: conta.senha };
  });
});

/** Devolve acesso a um vendedor que ficou sem user_id (cadastro antigo). */
export const criarAcessoVendedor = acao(async (vendedorId: string) => {
  await exigirAdmin();
  const id = z.string().uuid().parse(vendedorId);
  return sql.begin(async (tx) => {
    const [vendedor] = await tx<{ nome: string; user_id: string | null }[]>`
      select nome, user_id from vendedores where id = ${id} for update`;
    if (!vendedor) throw new Recusa("Vendedor não encontrado.");
    if (vendedor.user_id) throw new Recusa("Esse vendedor já tem acesso ao sistema.");
    const conta = await criarConta(tx, { nome: vendedor.nome });
    await tx`
      insert into user_roles (user_id, role) values (${conta.id}, 'vendedor')
      on conflict (user_id, role) do nothing`;
    await tx`update vendedores set user_id = ${conta.id} where id = ${id}`;
    return { nome: vendedor.nome, usuario: conta.usuario, senha: conta.senha };
  });
});

export const resetarSenha = acao(async (usuarioId: string) => {
  await exigirAdmin();
  const id = z.string().uuid().parse(usuarioId);
  const senha = gerarSenha();
  // Volta a ser provisória: o admin viu essa senha e ela passou pelo WhatsApp.
  const [conta] = await sql<{ email: string | null; meta: Meta | null }[]>`
    update usuarios
       set senha_hash = ${await bcrypt.hash(senha, 10)},
           raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"senha_provisoria": true}'::jsonb,
           updated_at = now()
     where id = ${id}
    returning email, raw_user_meta_data as meta`;
  if (!conta) throw new Recusa("Usuário não encontrado.");
  const meta = conta.meta ?? {};
  return {
    nome: (meta["nome"] as string) ?? "",
    usuario: (meta["usuario"] as string) ?? usuarioDeEmail(conta.email ?? ""),
    senha,
  };
});

const alvo = z.object({
  vendedorId: z.string().uuid().optional(),
  usuarioId: z.string().uuid().optional(),
});

export const excluirAcesso = acao(async (entrada: z.input<typeof alvo>) => {
  const s = await exigirAdmin();
  const data = alvo.parse(entrada);
  if (data.usuarioId && data.usuarioId === s.sub)
    throw new Recusa("Você não pode excluir a sua própria conta.");

  // Vendedor: o cadastro e o login saem juntos, nunca só a metade.
  if (data.vendedorId) {
    const vendedorId = data.vendedorId;
    return sql.begin(async (tx) => {
      const [vendedor] = await tx<{ user_id: string | null }[]>`
        select user_id from vendedores where id = ${vendedorId}`;
      if (vendedor?.user_id === s.sub) throw new Recusa("Você não pode excluir a sua própria conta.");
      await tx`delete from vendedores where id = ${vendedorId}`;
      if (vendedor?.user_id) await tx`delete from usuarios where id = ${vendedor.user_id}`;
      return { ok: true as const };
    });
  }

  if (!data.usuarioId) throw new Recusa("Nada para excluir.");
  // user_roles sai junto pelo ON DELETE CASCADE.
  await sql`delete from usuarios where id = ${data.usuarioId}`;
  return { ok: true as const };
});

const edicao = z.object({
  usuarioId: z.string().uuid().optional(),
  vendedorId: z.string().uuid().optional(),
  nome: z.string().min(2, "Informe o nome."),
  email: z.string().email("E-mail inválido.").optional().or(z.literal("")),
  whatsapp: z.string().optional().or(z.literal("")),
});

/**
 * Edita nome, e-mail de contato e WhatsApp. O `usuario` fica de fora de propósito:
 * é o login, e trocá-lo derrubaria o acesso de quem já recebeu a senha. O `slug`
 * do vendedor também não muda — ele está em links de catálogo já enviados a clientes.
 */
export const atualizarAcesso = acao(async (entrada: z.input<typeof edicao>) => {
  await exigirAdmin();
  const data = edicao.parse(entrada);
  if (!data.usuarioId && !data.vendedorId) throw new Recusa("Nada para editar.");
  const nome = data.nome.trim();
  const tel = somenteDigitos(data.whatsapp ?? "");
  if (tel && tel.length < 10) throw new Recusa("Informe o WhatsApp com DDD.");

  if (data.usuarioId) {
    // Merge, como o GoTrue fazia: `usuario` sobrevive; e-mail vazio vira null.
    // sql.json (não JSON.stringify+::jsonb): ver o comentário em criarConta.
    const patch = { nome, email_contato: data.email ? data.email.trim() : null };
    await sql`
      update usuarios
         set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || ${sql.json(patch)},
             updated_at = now()
       where id = ${data.usuarioId}`;
  }
  if (data.vendedorId) {
    // WhatsApp em branco mantém o atual.
    await sql`
      update vendedores set nome = ${nome}, whatsapp = coalesce(${tel || null}, whatsapp)
       where id = ${data.vendedorId}`;
  }
  return { ok: true as const };
});
