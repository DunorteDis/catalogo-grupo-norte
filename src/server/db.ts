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
 * Uma condição por palavra digitada, somadas com AND: cada palavra precisa estar
 * em alguma das colunas. Sem colunas, espera `produtos` com o alias `p` na
 * consulta. Sempre parametrizado: a palavra nunca vira texto de SQL.
 */
export function condicaoBusca(termo: string, colunas = [sql`p.nome`, sql`p.codigo`]) {
  return palavrasBusca(termo).reduce(
    (acc, palavra) => {
      const alguma = colunas
        .slice(1)
        .reduce(
          (o, c) => sql`${o} or ${c} ilike ${`%${palavra}%`}`,
          sql`${colunas[0]!} ilike ${`%${palavra}%`}`,
        );
      return sql`${acc} and (${alguma})`;
    },
    sql``,
  );
}
