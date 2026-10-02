"use server";

import { z } from "zod";

import type { PedidoDaLista } from "@/components/lista-pedidos";
import { acao } from "@/server/acao";
import { sql } from "@/server/db";
import { exigirAdmin, exigirLogin } from "@/server/sessao";

export type PedidoResumo = {
  created_at: string;
  total_itens: number;
  vendedor_id: string | null;
  vendedores: { nome: string } | null;
};

const periodo = z.tuple([z.string().datetime(), z.string().datetime()]);

/** Mesma forma que o embed do PostgREST devolvia: itens, vendedor e catálogo aninhados. */
async function listaPedidos(
  inicio: string,
  fim: string,
  filtro: { vendedorId: string } | { dist: string },
) {
  const [de, ate] = periodo.parse([inicio, fim]);
  return [
    ...(await sql<PedidoDaLista[]>`
      select p.id, p.cliente_nome, p.observacao, p.total_itens, p.created_at, p.conversa_id,
             case when v.id is null then null else json_build_object('nome', v.nome) end as vendedores,
             case when c.id is null then null
                  else json_build_object('nome', coalesce(m.nome, c.nome), 'cor', coalesce(m.cor, c.cor))
             end as distribuidoras,
             coalesce((select json_agg(json_build_object('codigo', i.codigo, 'codprod', i.codprod, 'nome', i.nome,
                                                         'quantidade', i.quantidade, 'unidade', i.unidade)
                                       order by i.created_at, i.id)
                         from pedido_itens i where i.pedido_id = p.id), '[]'::json) as pedido_itens
        from pedidos p
        left join vendedores v on v.id = p.vendedor_id
        left join catalogos c on c.id = p.catalogo_id
        left join distribuidoras m on m.id = c.marca_id
       where p.created_at between ${de} and ${ate}
         ${
           "vendedorId" in filtro
             ? sql`and p.vendedor_id = ${filtro.vendedorId}`
             : sql`and p.distribuidora_id = ${filtro.dist}`
         }
       order by p.created_at desc`),
  ];
}

export const meuVendedor = acao(async () => {
  const s = await exigirLogin();
  const [v] = await sql<{ id: string; nome: string; slug: string; whatsapp: string }[]>`
    select id, nome, slug, whatsapp from vendedores where user_id = ${s.sub}`;
  return v ?? null;
});

/** O vendedor sai da sessão, nunca do client: ninguém enxerga pedido de outro. */
export const meusPedidos = acao(async (inicio: string, fim: string) => {
  const s = await exigirLogin();
  const [v] = await sql<{ id: string }[]>`select id from vendedores where user_id = ${s.sub}`;
  return v ? listaPedidos(inicio, fim, { vendedorId: v.id }) : [];
});

/** Só os pedidos da distribuidora em uso. */
export const pedidosDoPeriodo = acao(async (inicio: string, fim: string) => {
  const s = await exigirAdmin();
  return listaPedidos(inicio, fim, { dist: s.dist });
});

/**
 * pedido_itens guarda só código/nome/quantidade, então a foto vem de produtos.
 * Não há FK entre os dois de propósito: apagar produto não derruba histórico.
 */
export const fotosPorCodigo = acao(async (codigos: string[]) => {
  await exigirLogin();
  const lista = z.array(z.string().max(60)).max(5000).parse(codigos);
  const linhas = await sql<{ codigo: string; arquivo: string | null }[]>`
    select codigo, arquivo from produtos where codigo = any(${sql.array(lista)})`;
  return Object.fromEntries(linhas.map((p) => [p.codigo, p.arquivo]));
});

export const resumoPainel = acao(async (desde: string, ate: string) => {
  const s = await exigirAdmin();
  const [de, fim] = periodo.parse([desde, ate]);
  return [
    ...(await sql<PedidoResumo[]>`
      select p.created_at, p.total_itens, p.vendedor_id,
             case when v.id is null then null else json_build_object('nome', v.nome) end as vendedores
        from pedidos p left join vendedores v on v.id = p.vendedor_id
       where p.distribuidora_id = ${s.dist} and p.created_at between ${de} and ${fim}
       order by p.created_at`),
  ];
});

export const vendedoresAtivos = acao(async () => {
  const s = await exigirAdmin();
  return [
    ...(await sql<{ id: string; nome: string; slug: string }[]>`
      select id, nome, slug from vendedores
       where ativo and distribuidora_id = ${s.dist} order by nome`),
  ];
});
