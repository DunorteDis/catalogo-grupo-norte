"use server";

import { z } from "zod";

import type { PedidoDaLista } from "@/components/lista-pedidos";
import { UNIDADES, type Unidade } from "@/lib/catalogo";
import { acao, Recusa } from "@/server/acao";
import { condicaoBusca, sql } from "@/server/db";
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
             case when cl.codcli is null then null
                  else json_build_object(
                    'codcli', cl.codcli,
                    'nome', coalesce(case when cl.fantasia ~ '[A-Za-z]' then trim(cl.fantasia) end,
                                     trim(cl.cliente)),
                    'cnpj', nullif(trim(cl.cgcent), ''))
             end as cliente,
             case when v.id is null then null else json_build_object('nome', v.nome) end as vendedores,
             case when c.id is null then null
                  else json_build_object('nome', coalesce(m.nome, c.nome), 'cor', coalesce(m.cor, c.cor))
             end as distribuidoras,
             coalesce((select json_agg(json_build_object('id', i.id, 'codigo', i.codigo, 'codprod', i.codprod, 'nome', i.nome,
                                                         'quantidade', i.quantidade, 'unidade', i.unidade)
                                       order by i.created_at, i.id)
                         from pedido_itens i where i.pedido_id = p.id), '[]'::json) as pedido_itens
        from pedidos p
        left join system.pcclient cl on cl.codcli = p.codcli
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

/** Vendedor mexe só nos pedidos dele; admin, nos da distribuidora em uso. */
async function exigirPedido(entrada: string) {
  const id = z.string().uuid().parse(entrada);
  const s = await exigirLogin();
  const dono =
    s.papel === "vendedor"
      ? sql`p.vendedor_id in (select id from vendedores where user_id = ${s.sub})`
      : sql`p.distribuidora_id = ${(await exigirAdmin()).dist}`;
  const [pedido] = await sql<{ id: string }[]>`
    select p.id from pedidos p where p.id = ${id} and ${dono}`;
  if (!pedido) throw new Recusa("Pedido não encontrado.");
  return pedido.id;
}

/**
 * Cliente do pedido: um da base do Winthor (buscarClientes), nunca texto livre. O nome que
 * o cliente digitou no catálogo continua guardado. null tira o cliente.
 */
export const clienteDoPedido = acao(async (pedidoId: string, entrada: number | null) => {
  const id = await exigirPedido(pedidoId);
  const codcli = entrada === null ? null : z.number().int().positive().parse(entrada);
  if (codcli) {
    const [ativo] = await sql<{ ok: boolean }[]>`
      select exists (select 1 from system.pcclient
                      where codcli = ${codcli} and dtexclusao is null) as ok`;
    if (!ativo?.ok) throw new Recusa("Cliente não encontrado ou inativo no Winthor.");
  }
  await sql`update pedidos set codcli = ${codcli} where id = ${id}`;
  return { ok: true as const };
});

export type ProdutoParaPedido = {
  id: string;
  codigo: string;
  codprod: number | null;
  nome: string;
  arquivo: string | null;
};

/** Produtos ativos para incluir no pedido, por nome, EAN ou código do ERP. */
export const produtosParaPedido = acao(async (entrada: string) => {
  await exigirLogin();
  const termo = z.string().max(200).parse(entrada).trim();
  if (termo.length < 2) return [];
  const busca = condicaoBusca(termo, [sql`p.nome`, sql`p.codigo`, sql`p.cod_produto::text`]);
  return [
    ...(await sql<ProdutoParaPedido[]>`
      select p.id, p.codigo, p.cod_produto as codprod, p.nome, p.arquivo
        from produtos p
       where p.ativo ${busca}
       order by p.nome, p.id
       limit 20`),
  ];
});

const quantidade = z
  .number()
  .int()
  .min(1, "Quantidade mínima: 1.")
  .max(9999, "Quantidade máxima: 9999.");
const unidade = z.enum(UNIDADES.map((u) => u.valor) as [Unidade, ...Unidade[]]);
const edicaoItens = z
  .object({
    /** Itens que ficam: só quantidade e unidade mudam. Os que não vierem aqui saem. */
    manter: z.array(z.object({ id: z.string().uuid(), quantidade, unidade })).max(2000),
    /** Produtos incluídos: código, nome e código do ERP saem do cadastro, não do navegador. */
    novos: z.array(z.object({ produtoId: z.string().uuid(), quantidade, unidade })).max(2000),
  })
  .refine((e) => e.manter.length + e.novos.length > 0, "O pedido precisa de pelo menos um item.");

export const salvarItensDoPedido = acao(
  async (pedidoId: string, entrada: z.input<typeof edicaoItens>) => {
    const id = await exigirPedido(pedidoId);
    const e = edicaoItens.parse(entrada);
    await sql.begin(async (tx) => {
      // Duas edições do mesmo pedido ao mesmo tempo: uma espera a outra.
      await tx`select 1 from pedidos where id = ${id} for update`;
      let incluidos: string[] = [];
      if (e.novos.length) {
        const produtos: readonly {
          id: string;
          codigo: string;
          nome: string;
          cod_produto: number | null;
        }[] = await tx`
          select id, codigo, nome, cod_produto from produtos
           where ativo and id in ${tx(e.novos.map((n) => n.produtoId))}`;
        const porId = new Map(produtos.map((p) => [p.id, p]));
        const linhas = e.novos.map((n) => {
          const p = porId.get(n.produtoId);
          if (!p)
            throw new Recusa("Um dos produtos saiu do cadastro. Atualize a tela e tente de novo.");
          return {
            pedido_id: id,
            codigo: p.codigo,
            nome: p.nome,
            codprod: p.cod_produto,
            quantidade: n.quantidade,
            unidade: n.unidade,
          };
        });
        const novos: readonly { id: string }[] = await tx`
          insert into pedido_itens ${tx(linhas, "pedido_id", "codigo", "nome", "codprod", "quantidade", "unidade")}
          returning id`;
        incluidos = novos.map((n) => n.id);
      }
      for (const m of e.manter)
        await tx`
          update pedido_itens set quantidade = ${m.quantidade}, unidade = ${m.unidade}
           where id = ${m.id} and pedido_id = ${id}`;
      // Os que saíram vão por último: o total do pedido não pode passar por zero (CHECK).
      const ficam = [...e.manter.map((m) => m.id), ...incluidos];
      await tx`
        delete from pedido_itens
         where pedido_id = ${id} and not (id::text = any(${tx.array(ficam)}))`;
    });
    return { ok: true as const };
  },
);
