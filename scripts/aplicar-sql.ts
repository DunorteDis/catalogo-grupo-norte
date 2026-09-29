// Aplica arquivos .sql no banco do .env, um por vez (cada um é uma transação).
// Roda com: bun scripts/aplicar-sql.ts <arquivo>...
// --ensaio: roda todos numa transação só e desfaz no fim. Mostra se passam com os
// dados reais sem mudar nada (NOTICEs da conferência aparecem no console).
import { readFile } from "node:fs/promises";

import postgres from "postgres";

const args = process.argv.slice(2);
const ensaio = args.includes("--ensaio");
const arquivos = args.filter((a) => a !== "--ensaio");
if (arquivos.length === 0)
  throw new Error("Uso: bun scripts/aplicar-sql.ts [--ensaio] <arquivo.sql>...");

class Desfazer extends Error {}

// Só a mensagem do NOTICE: é por ela que a migração conta o que conferiu.
const sql = postgres({ max: 1, onnotice: (n) => console.log(`NOTICE: ${n["message"]}`) });
try {
  if (ensaio) {
    await sql
      .begin(async (tx) => {
        for (const a of arquivos) {
          await tx.unsafe(await readFile(a, "utf8"));
          console.log(`Ensaiado: ${a}`);
        }
        throw new Desfazer();
      })
      .catch((e) => {
        if (!(e instanceof Desfazer)) throw e;
      });
    console.log("Ensaio desfeito: nada mudou no banco.");
  } else {
    for (const a of arquivos) {
      await sql.unsafe(await readFile(a, "utf8"));
      console.log(`Aplicado: ${a}`);
    }
  }
} finally {
  await sql.end();
}
