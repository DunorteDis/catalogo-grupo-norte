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

/**
 * Colunas do catálogo como a tela e o cliente veem: o de marca herda nome, cor e
 * logo da marca. Espera `catalogos c left join distribuidoras m on m.id = c.marca_id`.
 */
export function camposCatalogo() {
  return sql`c.id, c.slug, c.ativo, c.marca_id, c.marca_id is null as personalizado,
    coalesce(m.nome, c.nome) as nome, coalesce(m.cor, c.cor) as cor,
    c.emoji, c.imagem_url, m.logo_url`;
}

/**
 * Carteira de clientes do Winthor (codusur, codcli, cliente, cnpj, bloqueio, ativo). A de
 * vendedor interno está na vendedor_interno_carteira; a de RCA e externo, na
 * vendedor_carteira_cliente. Os codusur não se repetem entre as duas: juntar não duplica.
 */
export function carteiraWinthor() {
  return sql`(
    select codusur::int, codcli::int, cliente, cnpj, bloqueio, ativo
      from system.vendedor_interno_carteira
    union all
    select codusur::int, codcli::int, cliente, cnpj, bloqueio, ativo
      from system.vendedor_carteira_cliente
  )`;
}

/** No ar para o cliente: catálogo ligado, dona ativa e marca (se houver) ativa. Mesmos aliases. */
export function catalogoNoAr() {
  return sql`c.ativo and (m.id is null or m.ativo)
    and exists (select 1 from distribuidoras dona where dona.id = c.distribuidora_id and dona.ativo)`;
}
