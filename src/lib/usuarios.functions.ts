import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function garantirAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error("Não foi possível verificar suas permissões.");
  if (!data) throw new Error("Apenas administradores podem gerenciar usuários.");
}

export const listarUsuarios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await garantirAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw new Error("Não foi possível carregar os usuários.");

    const ids = data.users.map((u) => u.id);
    const { data: papeis } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

    const admins = new Set((papeis ?? []).filter((p) => p.role === "admin").map((p) => p.user_id));
    return data.users.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      criadoEm: u.created_at,
      admin: admins.has(u.id),
    }));
  });

export const criarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email("E-mail inválido."),
        senha: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
        admin: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await garantirAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: criado, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
    });
    if (error || !criado.user) {
      const m = error?.message ?? "";
      if (/already been registered|already exists/i.test(m))
        throw new Error("Já existe um usuário com esse e-mail.");
      if (/weak|pwned/i.test(m))
        throw new Error("Essa senha é muito comum. Escolha uma senha mais forte.");
      throw new Error("Não foi possível criar o usuário.");
    }

    if (data.admin) {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: criado.user.id, role: "admin" }, { onConflict: "user_id,role" });
    }
    return { id: criado.user.id };
  });

export const excluirUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await garantirAdmin(context as any);
    if (data.id === context.userId) throw new Error("Você não pode excluir a sua própria conta.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (error) throw new Error("Não foi possível excluir o usuário.");
    return { ok: true };
  });

export const alterarSenhaUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        senha: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await garantirAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
      password: data.senha,
    });
    if (error) {
      if (/weak|pwned/i.test(error.message))
        throw new Error("Essa senha é muito comum. Escolha uma senha mais forte.");
      throw new Error("Não foi possível alterar a senha.");
    }
    return { ok: true };
  });
