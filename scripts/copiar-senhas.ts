// Uma vez: traz o hash bcrypt de cada usuário do Supabase para crm.usuarios.
// Roda com: bun scripts/copiar-senhas.ts   (SUPABASE_DB_URL e PG* no .env)
import postgres from "postgres";

const url = process.env["SUPABASE_DB_URL"];
if (!url) throw new Error("Defina SUPABASE_DB_URL (Supabase → Project Settings → Database).");

// prepare: false — o pooler do Supabase em modo transação não aceita prepared statement.
const supabase = postgres(url, { ssl: "require", max: 1, prepare: false });
const crm = postgres({ connection: { search_path: "crm" }, max: 1 });

try {
  const origem = await supabase<{ id: string; encrypted_password: string | null }[]>`
    select id, encrypted_password from auth.users`;
  const hashPorId = new Map(origem.map((u) => [u.id, u.encrypted_password]));
  const destino = await crm<{ id: string; email: string }[]>`select id, email from usuarios`;

  const semHash: string[] = [];
  let copiados = 0;
  for (const u of destino) {
    const hash = hashPorId.get(u.id);
    if (!hash) {
      semHash.push(u.email);
      continue;
    }
    await crm`update usuarios set senha_hash = ${hash} where id = ${u.id}`;
    copiados++;
  }
  console.log(`${copiados} de ${destino.length} usuários com senha copiada.`);
  if (semHash.length) console.log(`Sem hash no Supabase: ${semHash.join(", ")}`);
} finally {
  await supabase.end();
  await crm.end();
}
