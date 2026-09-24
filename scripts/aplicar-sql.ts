// Aplica um arquivo .sql no banco do .env. Roda com: bun scripts/aplicar-sql.ts <arquivo>
import { readFile } from "node:fs/promises";

import postgres from "postgres";

const arquivo = process.argv[2];
if (!arquivo) throw new Error("Uso: bun scripts/aplicar-sql.ts <arquivo.sql>");

const sql = postgres({ max: 1 });
try {
  await sql.unsafe(await readFile(arquivo, "utf8"));
  console.log(`Aplicado: ${arquivo}`);
} finally {
  await sql.end();
}
