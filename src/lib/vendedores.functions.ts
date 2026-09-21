import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { slugify, somenteDigitos } from "@/lib/catalogo";

async function garantirAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error("Não foi possível verificar suas permissões.");
  if (!data) throw new Error("Apenas administradores podem gerenciar vendedores.");
}

export const criarVendedor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        nome: z.string().min(2, "Informe o nome do vendedor."),
        whatsapp: z.string().min(8, "Informe o WhatsApp com DDD."),
        email: z.string().email("E-mail inválido."),
        senha: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
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
      throw new Error("Não foi possível criar o acesso do vendedor.");
    }

    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: criado.user.id, role: "vendedor" }, { onConflict: "user_id,role" });

    const slug = `${slugify(data.nome)}-${Math.random().toString(36).slice(2, 6)}`;
    const { error: erroVendedor } = await supabaseAdmin.from("vendedores").insert({
      nome: data.nome.trim(),
      slug,
      whatsapp: somenteDigitos(data.whatsapp),
      user_id: criado.user.id,
    });
    if (erroVendedor) {
      await supabaseAdmin.auth.admin.deleteUser(criado.user.id);
      throw new Error("Não foi possível cadastrar o vendedor.");
    }

    return { slug };
  });

export const excluirVendedor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await garantirAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: vendedor } = await supabaseAdmin
      .from("vendedores")
      .select("id, user_id")
      .eq("id", data.id)
      .maybeSingle();

    const { error } = await supabaseAdmin.from("vendedores").delete().eq("id", data.id);
    if (error) throw new Error("Não foi possível excluir o vendedor.");
    if (vendedor?.user_id) await supabaseAdmin.auth.admin.deleteUser(vendedor.user_id);
    return { ok: true };
  });

export const alterarSenhaVendedor = createServerFn({ method: "POST" })
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

    const { data: vendedor } = await supabaseAdmin
      .from("vendedores")
      .select("user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!vendedor?.user_id) throw new Error("Esse vendedor ainda não tem acesso ao sistema.");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(vendedor.user_id, {
      password: data.senha,
    });
    if (error) {
      if (/weak|pwned/i.test(error.message))
        throw new Error("Essa senha é muito comum. Escolha uma senha mais forte.");
      throw new Error("Não foi possível alterar a senha.");
    }
    return { ok: true };
  });
