import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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

async function garantirAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error("Não foi possível verificar suas permissões.");
  if (!data) throw new Error("Apenas administradores podem gerenciar acessos.");
}

function ehEmailEmUso(mensagem: string) {
  return /already been registered|already exists|duplicate/i.test(mensagem);
}

/**
 * Com `usuario` informado, respeita a escolha e falha se estiver em uso — quem
 * digitou precisa saber, e não receber um "fulano2" por baixo dos panos. Sem ele
 * (vendedor órfão, que não tem formulário), sugere a partir do nome e incrementa.
 *
 * O conflito é decidido pelo Supabase, não por uma consulta prévia: entre olhar e
 * inserir cabe outra criação com o mesmo usuário.
 */
async function criarConta(
  supabaseAdmin: (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"],
  opts: { nome: string; usuario?: string | undefined; emailContato?: string | undefined },
) {
  const escolhido = opts.usuario ? normalizarUsuario(opts.usuario) : null;
  const base = escolhido ?? usuarioDeNome(opts.nome);
  const tentativas = escolhido ? 1 : 25;

  for (let i = 0; i < tentativas; i++) {
    const usuario = i === 0 ? base : `${base}${i + 1}`;
    const senha = gerarSenha();
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: emailDeUsuario(usuario),
      password: senha,
      email_confirm: true,
      user_metadata: {
        nome: opts.nome.trim(),
        usuario,
        ...(opts.emailContato ? { email_contato: opts.emailContato } : {}),
      },
    });
    if (!error && data.user) return { user: data.user, usuario, senha };
    const m = error?.message ?? "";
    if (ehEmailEmUso(m)) {
      if (escolhido)
        throw new Error(`Já existe alguém com o usuário "${escolhido}". Escolha outro.`);
      continue;
    }
    if (/weak|pwned/i.test(m)) throw new Error("A senha gerada foi recusada pelo servidor.");
    throw new Error("Não foi possível criar o acesso.");
  }
  throw new Error("Não foi possível gerar um usuário livre para esse nome.");
}

export const listarAcessos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await garantirAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw new Error("Não foi possível carregar os acessos.");

    const ids = data.users.map((u) => u.id);
    const { data: papeis } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

    // Inclui vendedores sem user_id: sem isso um vendedor órfão sumiria da
    // administração e não haveria por onde devolver o acesso dele.
    const { data: vendedores } = await supabaseAdmin
      .from("vendedores")
      .select("id, nome, slug, whatsapp, ativo, user_id, created_at")
      .order("nome");

    const admins = new Set((papeis ?? []).filter((p) => p.role === "admin").map((p) => p.user_id));
    const porUsuario = new Map(
      (vendedores ?? []).flatMap((v) => (v.user_id ? [[v.user_id, v] as const] : [])),
    );

    const contas = data.users.map((u) => {
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
      const vendedor = porUsuario.get(u.id) ?? null;
      return {
        usuarioId: u.id as string | null,
        usuario: (meta["usuario"] as string) ?? usuarioDeEmail(u.email ?? ""),
        nome: vendedor?.nome ?? (meta["nome"] as string) ?? "",
        emailContato: (meta["email_contato"] as string) ?? "",
        criadoEm: u.created_at as string | null,
        admin: admins.has(u.id),
        vendedor,
      };
    });

    const semAcesso = (vendedores ?? [])
      .filter((v) => !v.user_id)
      .map((v) => ({
        usuarioId: null,
        usuario: "",
        nome: v.nome,
        emailContato: "",
        criadoEm: v.created_at as string | null,
        admin: false,
        vendedor: v,
      }));

    return [...contas, ...semAcesso];
  });

export const criarAcesso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        tipo: z.enum(["vendedor", "admin"]),
        nome: z.string().min(2, "Informe o nome."),
        usuario: z
          .string()
          .min(USUARIO_MIN, `O usuário precisa de ao menos ${USUARIO_MIN} caracteres.`)
          .max(USUARIO_MAX, `O usuário passa de ${USUARIO_MAX} caracteres.`)
          .regex(
            USUARIO_REGEX,
            "Use apenas letras, números e ponto — por exemplo, primeiro.ultimo.",
          ),
        email: z.string().email("E-mail inválido.").optional().or(z.literal("")),
        whatsapp: z.string().optional().or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await garantirAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.tipo === "vendedor" && somenteDigitos(data.whatsapp ?? "").length < 10)
      throw new Error("Informe o WhatsApp do vendedor, com DDD.");

    const { user, usuario, senha } = await criarConta(supabaseAdmin, {
      nome: data.nome,
      usuario: data.usuario,
      emailContato: data.email || undefined,
    });

    await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: user.id, role: data.tipo === "admin" ? "admin" : "vendedor" },
        { onConflict: "user_id,role" },
      );

    if (data.tipo === "vendedor") {
      const slug = `${slugify(data.nome)}-${sortear(ALFABETO_SENHA, 4).join("")}`;
      const { error } = await supabaseAdmin.from("vendedores").insert({
        nome: data.nome.trim(),
        slug,
        whatsapp: somenteDigitos(data.whatsapp ?? ""),
        user_id: user.id,
      });
      if (error) {
        await supabaseAdmin.auth.admin.deleteUser(user.id);
        throw new Error("Não foi possível cadastrar o vendedor.");
      }
    }

    return { nome: data.nome.trim(), usuario, senha };
  });

/** Devolve acesso a um vendedor que ficou sem user_id (cadastro antigo). */
export const criarAcessoVendedor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ vendedorId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await garantirAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: vendedor } = await supabaseAdmin
      .from("vendedores")
      .select("id, nome, user_id")
      .eq("id", data.vendedorId)
      .maybeSingle();
    if (!vendedor) throw new Error("Vendedor não encontrado.");
    if (vendedor.user_id) throw new Error("Esse vendedor já tem acesso ao sistema.");

    const { user, usuario, senha } = await criarConta(supabaseAdmin, { nome: vendedor.nome });

    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: user.id, role: "vendedor" }, { onConflict: "user_id,role" });

    const { error } = await supabaseAdmin
      .from("vendedores")
      .update({ user_id: user.id })
      .eq("id", data.vendedorId);
    if (error) {
      await supabaseAdmin.auth.admin.deleteUser(user.id);
      throw new Error("Não foi possível vincular o acesso ao vendedor.");
    }

    return { nome: vendedor.nome, usuario, senha };
  });

export const resetarSenha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ usuarioId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await garantirAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: atual, error: erroBusca } = await supabaseAdmin.auth.admin.getUserById(
      data.usuarioId,
    );
    if (erroBusca || !atual.user) throw new Error("Usuário não encontrado.");

    const senha = gerarSenha();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.usuarioId, {
      password: senha,
    });
    if (error) throw new Error("Não foi possível resetar a senha.");

    const meta = (atual.user.user_metadata ?? {}) as Record<string, unknown>;
    return {
      nome: (meta["nome"] as string) ?? "",
      usuario: (meta["usuario"] as string) ?? usuarioDeEmail(atual.user.email ?? ""),
      senha,
    };
  });

export const excluirAcesso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        vendedorId: z.string().uuid().optional(),
        usuarioId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await garantirAdmin(context as any);
    if (data.usuarioId && data.usuarioId === context.userId)
      throw new Error("Você não pode excluir a sua própria conta.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Vendedor: o cadastro e o login saem juntos, nunca só a metade.
    if (data.vendedorId) {
      const { data: vendedor } = await supabaseAdmin
        .from("vendedores")
        .select("id, user_id")
        .eq("id", data.vendedorId)
        .maybeSingle();
      if (vendedor?.user_id === context.userId)
        throw new Error("Você não pode excluir a sua própria conta.");

      const { error } = await supabaseAdmin.from("vendedores").delete().eq("id", data.vendedorId);
      if (error) throw new Error("Não foi possível excluir o vendedor.");
      if (vendedor?.user_id) await supabaseAdmin.auth.admin.deleteUser(vendedor.user_id);
      return { ok: true };
    }

    if (!data.usuarioId) throw new Error("Nada para excluir.");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.usuarioId);
    if (error) throw new Error("Não foi possível excluir o usuário.");
    return { ok: true };
  });
