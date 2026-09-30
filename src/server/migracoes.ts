import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { sql } from "@/server/db";

const PASTA = path.join(process.cwd(), "db", "migrations");
// ponytail: da 001 à 009 foram aplicadas à mão antes deste controle existir. Quando a
// tabela nasce, elas entram como já aplicadas, para não rodarem de novo.
const PRIMEIRA_AUTOMATICA = "010";
// Duas instâncias subindo juntas esperam uma pela outra em vez de aplicar a mesma migração.
const TRAVA = 20260930;

/**
 * Aplica, na ordem do nome, as migrações de db/migrations que ainda não estão em
 * crm.migracoes. Roda quando o servidor sobe (src/instrumentation.ts). Tudo numa
 * transação só: se uma falhar, nenhuma entra e o erro aparece no log.
 */
export async function migrar() {
  const arquivos = (await readdir(PASTA)).filter((a) => a.endsWith(".sql")).sort();

  const aplicadas = await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${TRAVA})`;
    const [controle] = await tx<{ existe: boolean }[]>`
      select to_regclass('crm.migracoes') is not null as existe`;
    if (!controle!.existe) {
      await tx`
        create table crm.migracoes (
          arquivo text primary key,
          aplicada_em timestamptz not null default now()
        )`;
      const antigas = arquivos
        .filter((a) => a < PRIMEIRA_AUTOMATICA)
        .map((arquivo) => ({ arquivo }));
      if (antigas.length) await tx`insert into crm.migracoes ${tx(antigas, "arquivo")}`;
    }

    const feitas = await tx<{ arquivo: string }[]>`select arquivo from crm.migracoes`;
    const jaFeitas = new Set(feitas.map((f) => f.arquivo));
    const pendentes = arquivos.filter((a) => !jaFeitas.has(a));
    for (const arquivo of pendentes) {
      await tx.unsafe(await readFile(path.join(PASTA, arquivo), "utf8"));
      await tx`insert into crm.migracoes (arquivo) values (${arquivo})`;
    }
    return pendentes;
  });

  for (const arquivo of aplicadas) console.log(`Migração aplicada: ${arquivo}`);
}
