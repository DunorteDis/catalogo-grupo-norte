// Usuários de fumaça, apagados no fim de cada tarefa que os usou.
// Roda com: SENHA_TESTE=... bun scripts/usuario-teste.ts criar|apagar
import bcrypt from "bcryptjs";
import postgres from "postgres";

const sql = postgres({ connection: { search_path: "crm" }, max: 1 });
const ADMIN = "teste.admin@acesso.gruponorte.com.br";
const VENDEDOR = "teste.vendedor@acesso.gruponorte.com.br";
const SLUG = "teste-migracao";

try {
  if (process.argv[2] === "criar") {
    const senha = process.env["SENHA_TESTE"];
    if (!senha || senha.length < 8) throw new Error("Defina SENHA_TESTE (8+ caracteres).");
    const hash = await bcrypt.hash(senha, 10);
    await sql.begin(async (tx: postgres.TransactionSql) => {
      for (const [email, papel] of [
        [ADMIN, "admin"],
        [VENDEDOR, "vendedor"],
      ] as const) {
        const [u] = await tx<{ id: string }[]>`
          insert into usuarios (email, senha_hash, raw_user_meta_data, email_confirmed_at)
          values (${email}, ${hash}, ${JSON.stringify({ nome: `Teste ${papel}`, usuario: email.split("@")[0] })}::jsonb, now())
          returning id`;
        await tx`insert into user_roles (user_id, role) values (${u!.id}, ${papel})`;
        if (papel === "vendedor")
          await tx`insert into vendedores (nome, slug, whatsapp, user_id)
                   values ('Teste Migração', ${SLUG}, '65999999999', ${u!.id})`;
      }
    });
    console.log("Criados teste.admin e teste.vendedor (slug teste-migracao).");
  } else if (process.argv[2] === "apagar") {
    await sql.begin(async (tx: postgres.TransactionSql) => {
      // Pedido de teste perderia o vendedor (ON DELETE SET NULL) e ficaria órfão no painel.
      await tx`delete from pedidos where vendedor_id in (select id from vendedores where slug = ${SLUG})`;
      await tx`delete from vendedores where slug = ${SLUG}`;
      await tx`delete from usuarios where email in (${ADMIN}, ${VENDEDOR})`;
    });
    console.log("Usuários, vendedor e pedidos de teste apagados.");
  } else {
    throw new Error("Uso: bun scripts/usuario-teste.ts criar|apagar");
  }
} finally {
  await sql.end();
}
