import postgres from "postgres";

import { palavrasBusca } from "@/lib/catalogo";

// ponytail: sem string de conexão — o postgres.js lê PGHOST, PGPORT, PGDATABASE,
// PGUSER e PGPASSWORD, e a senha com "@" não precisa ser escapada numa URL.
function conectar() {
  return postgres({
    connection: { search_path: "crm" },
    // As telas tratam data como texto ISO, que era o que o Supabase devolvia.
    transform: { value: (valor: unknown) => (valor instanceof Date ? valor.toISOString() : valor) },
    onnotice: () => {},
  });
}

const global = globalThis as unknown as { sql?: ReturnType<typeof conectar> };
// No dev o HMR reavalia o módulo; sem isso cada edição abriria um pool novo.
export const sql = global.sql ?? conectar();
if (process.env.NODE_ENV !== "production") global.sql = sql;

/**
 * Uma condição por palavra digitada, somadas com AND. Espera `produtos` com o
 * alias `p` na consulta. Sempre parametrizado: a palavra nunca vira texto de SQL.
 */
export function condicaoBusca(termo: string) {
  return palavrasBusca(termo).reduce(
    (acc, palavra) =>
      sql`${acc} and (p.nome ilike ${`%${palavra}%`} or p.codigo ilike ${`%${palavra}%`})`,
    sql``,
  );
}
