// Integração, só leitura, contra o banco do .env. Sem PGHOST, pula.
import { afterAll, describe, expect, test } from "bun:test";

import { condicaoBusca, sql } from "./db";

describe.skipIf(!process.env["PGHOST"])("banco", () => {
  afterAll(() => sql.end());

  test("data chega como texto ISO, como o Supabase entregava", async () => {
    const [linha] = await sql<{ agora: string }[]>`select now() as agora`;
    expect(typeof linha!.agora).toBe("string");
    expect(linha!.agora).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test("busca acha pelas palavras em qualquer ordem", async () => {
    const [alvo] = await sql<{ id: string; nome: string }[]>`
      select id, nome from produtos where nome ~ '^[A-Z0-9]+ [A-Z0-9]+' limit 1`;
    const [a, b] = alvo!.nome.split(" ");
    const achados = await sql<{ id: string }[]>`
      select p.id from produtos p where true ${condicaoBusca(`${b} ${a}`)}`;
    expect(achados.map((x) => x.id)).toContain(alvo!.id);
  });

  test("busca com aspas, curinga e comentário não injeta nem quebra", async () => {
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from produtos p where true ${condicaoBusca("x' or 1=1 -- %_")}`;
    const [{ total }] = await sql<{ total: number }[]>`select count(*)::int as total from produtos`;
    expect(n).toBeLessThan(total);
  });

  test("busca vazia não filtra", async () => {
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from produtos p where true ${condicaoBusca("")}`;
    const [{ total }] = await sql<{ total: number }[]>`select count(*)::int as total from produtos`;
    expect(n).toBe(total);
  });

  test("lista vazia em any() devolve nada, sem erro de SQL", async () => {
    const linhas = await sql`select id from produtos where id = any(${sql.array([])}::uuid[])`;
    expect(linhas).toHaveLength(0);
  });

  test("migração 001 aplicada", async () => {
    await sql`select senha_hash from usuarios limit 0`;
    await sql`select id, tipo, dados from imagens limit 0`;
  });

  // Ver criarConta em src/server/acessos.ts: bug real achado na Task 9, corrigido também em
  // definirSenha (auth.ts) e usuario-teste.ts. Os dois testes abaixo documentam por que.
  test("sql.json mantém o merge jsonb como objeto", async () => {
    const [{ t }] = await sql<{ t: string }[]>`
      select jsonb_typeof('{"a":1}'::jsonb || ${sql.json({ senha_provisoria: false })}) as t`;
    expect(t).toBe("object");
  });

  // Pino da armadilha: com ::jsonb, postgres.js serializa o parâmetro de novo — a string já
  // stringificada vira um valor jsonb do tipo string, não objeto. É por isso que criarConta,
  // definirSenha e usuario-teste.ts usam sql.json/tx.json em vez de JSON.stringify(...)::jsonb.
  test("JSON.stringify + ::jsonb grava uma string, não um objeto (por isso não se usa)", async () => {
    const [{ t }] = await sql<{ t: string }[]>`
      select jsonb_typeof(${JSON.stringify({ a: 1 })}::jsonb) as t`;
    expect(t).toBe("string");
  });
});
