"use server";

import { acao } from "@/server/acao";
import { sql } from "@/server/db";
import { exigirAdmin } from "@/server/sessao";

// Distribuidoras e catálogos personalizados moram na mesma tabela: mesma forma
// (nome, slug, cor, lista de produtos, link público), só muda a marca.

/** Só distribuidora de verdade: personalizado se liga, desliga e exclui na tela de Catálogos. */
export const listarDistribuidoras = acao(async () => {
  await exigirAdmin();
  return [
    ...(await sql<{ id: string; nome: string; slug: string; cor: string; ativo: boolean }[]>`
      select id, nome, slug, cor, ativo from distribuidoras where not personalizado order by nome`),
  ];
});

export const ativarCatalogo = acao(async (id: string, ativo: boolean) => {
  await exigirAdmin();
  await sql`update distribuidoras set ativo = ${ativo} where id = ${id}`;
});
