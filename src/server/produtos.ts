"use server";

import { z } from "zod";

import { PAGINA_PRODUTOS } from "@/lib/catalogo";
import { acao } from "@/server/acao";
import { condicaoBusca, sql } from "@/server/db";
import { exigirAdmin } from "@/server/sessao";

type Produto = {
  id: string;
  codigo: string;
  nome: string;
  arquivo: string | null;
  ativo: boolean;
  cod_empresa: number | null;
};

export const listarProdutos = acao(async (termo: string, pagina: number) => {
  await exigirAdmin();
  const [linhas, [contagem]] = await Promise.all([
    sql<Produto[]>`
      select p.id, p.codigo, p.nome, p.arquivo, p.ativo, p.cod_empresa
        from produtos p where true ${condicaoBusca(termo)}
       -- O ERP repete nome: sem desempate a mesma linha aparece em duas páginas,
       -- e excluir a "duplicada" apaga a única que existe.
       order by p.nome, p.id
       limit ${PAGINA_PRODUTOS} offset ${pagina * PAGINA_PRODUTOS}`,
    sql<{ total: number }[]>`
      select count(*)::int as total from produtos p where true ${condicaoBusca(termo)}`,
  ]);
  return { linhas: [...linhas], total: contagem?.total ?? 0 };
});

const produtoSchema = z.object({
  codigo: z.string().trim().min(1, "Informe o código."),
  nome: z.string().trim().min(1, "Informe o nome."),
  arquivo: z.string().trim(),
});

export const salvarProduto = acao(
  async (id: string | null, entrada: z.input<typeof produtoSchema>) => {
    await exigirAdmin();
    const v = produtoSchema.parse(entrada);
    const valores = { codigo: v.codigo, nome: v.nome, arquivo: v.arquivo || null };
    if (id)
      await sql`update produtos set ${sql(valores, "codigo", "nome", "arquivo")} where id = ${id}`;
    else await sql`insert into produtos ${sql(valores, "codigo", "nome", "arquivo")}`;
  },
);

export const ativarProduto = acao(async (id: string, ativo: boolean) => {
  await exigirAdmin();
  await sql`update produtos set ativo = ${ativo} where id = ${id}`;
});

export const excluirProduto = acao(async (id: string) => {
  await exigirAdmin();
  await sql`delete from produtos where id = ${id}`;
});
