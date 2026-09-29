// Usuários de fumaça, apagados no fim de cada tarefa que os usou.
// Roda com: SENHA_TESTE=... bun scripts/usuario-teste.ts criar|apagar
import bcrypt from "bcryptjs";
import postgres from "postgres";

const sql = postgres({ connection: { search_path: "crm" }, max: 1 });
const ADMIN = "teste.admin@acesso.gruponorte.com.br";
const VENDEDOR = "teste.vendedor@acesso.gruponorte.com.br";
// Admin de outra distribuidora: é por ele que a fumaça confere o isolamento.
const ADMIN_DUNOPRO = "teste.dunopro@acesso.gruponorte.com.br";
const VENDEDOR_DUNOPRO = "teste.vendedor.dunopro@acesso.gruponorte.com.br";
const SLUG = "teste-migracao";
// Link público de outra dona: /c/teste-dunopro/dunorte não pode abrir o catálogo da Abastex.
const SLUG_DUNOPRO = "teste-dunopro";

try {
  if (process.argv[2] === "criar") {
    const senha = process.env["SENHA_TESTE"];
    if (!senha || senha.length < 8) throw new Error("Defina SENHA_TESTE (8+ caracteres).");
    const hash = await bcrypt.hash(senha, 10);
    await sql.begin(async (tx: postgres.TransactionSql) => {
      const [abastex] = await tx<
        { id: string }[]
      >`select id from distribuidoras where slug = 'abastex'`;
      const [dunopro] = await tx<
        { id: string }[]
      >`select id from distribuidoras where slug = 'dunopro'`;
      if (!abastex || !dunopro) throw new Error("Cadastre Abastex e DunoPro antes.");
      for (const [email, papel, dist, slug] of [
        [ADMIN, "admin", abastex.id, null],
        [VENDEDOR, "vendedor", abastex.id, SLUG],
        [ADMIN_DUNOPRO, "admin", dunopro.id, null],
        [VENDEDOR_DUNOPRO, "vendedor", dunopro.id, SLUG_DUNOPRO],
      ] as const) {
        // tx.json, não JSON.stringify+::jsonb — ver o comentário em criarConta (src/server/acessos.ts).
        const [u] = await tx<{ id: string }[]>`
          insert into usuarios (email, senha_hash, raw_user_meta_data, email_confirmed_at, distribuidora_id)
          values (${email}, ${hash}, ${tx.json({ nome: `Teste ${papel}`, usuario: email.split("@")[0] })}, now(), ${dist})
          returning id`;
        await tx`insert into user_roles (user_id, role) values (${u!.id}, ${papel})`;
        if (slug)
          await tx`insert into vendedores (nome, slug, whatsapp, user_id, distribuidora_id)
                   values ('Teste Migração', ${slug}, '65999999999', ${u!.id}, ${dist})`;
      }
    });
    console.log(
      "Criados teste.admin e teste.vendedor (Abastex, /c/teste-migracao), teste.dunopro e teste.vendedor.dunopro (DunoPro, /c/teste-dunopro).",
    );
  } else if (process.argv[2] === "apagar") {
    await sql.begin(async (tx: postgres.TransactionSql) => {
      // Pedido de teste perderia o vendedor (ON DELETE SET NULL) e ficaria órfão no painel.
      await tx`delete from pedidos where vendedor_id in
                 (select id from vendedores where slug in (${SLUG}, ${SLUG_DUNOPRO}))`;
      await tx`delete from vendedores where slug in (${SLUG}, ${SLUG_DUNOPRO})`;
      await tx`delete from usuarios
                where email in (${ADMIN}, ${VENDEDOR}, ${ADMIN_DUNOPRO}, ${VENDEDOR_DUNOPRO})`;
    });
    console.log("Usuários, vendedor e pedidos de teste apagados.");
  } else {
    throw new Error("Uso: bun scripts/usuario-teste.ts criar|apagar");
  }
} finally {
  await sql.end();
}
