"use server";

import { createHash } from "node:crypto";
import { z } from "zod";

import type { CatalogoPublico } from "@/hooks/use-catalogos-publicos";
import {
  celularValido,
  PAGINA_VITRINE,
  somenteDigitos,
  UNIDADES,
  type Unidade,
} from "@/lib/catalogo";
import { acao, Recusa } from "@/server/acao";
import { camposCatalogo, catalogoNoAr, condicaoBusca, sql } from "@/server/db";
import { ipDaRequisicao } from "@/server/sessao";
import { clientePeloTelefone } from "@/server/whatsapp";

// Tudo aqui é público (cliente sem login): nada de lista de vendedores.

/** UM vendedor, o do slug do link. Nome e WhatsApp da equipe inteira não são públicos. */
export const vendedorPorSlug = acao(async (slug: string) => {
  const [v] = await sql<{ id: string; nome: string; whatsapp: string }[]>`
    select v.id, v.nome, v.whatsapp
      from vendedores v join distribuidoras d on d.id = v.distribuidora_id
     where v.slug = ${String(slug)} and v.ativo and d.ativo`;
  return v ?? null;
});

/** Cliente da chave do link (?c=), se ela ainda vale para esse vendedor. */
async function clientePorChave(vendedor: { id: string } | { slug: string }, chave: string) {
  const [c] = await sql<{ codcli: number; nome: string }[]>`
    select l.codcli,
           coalesce(case when c.fantasia ~ '[A-Za-z]' then trim(c.fantasia) end, trim(c.cliente)) as nome
      from links_cliente l
      join vendedores v on v.id = l.vendedor_id and v.ativo
      join system.pcclient c on c.codcli = l.codcli and c.dtexclusao is null
     where l.chave = ${chave.slice(0, 40)}
       and ${"id" in vendedor ? sql`v.id = ${vendedor.id}` : sql`v.slug = ${vendedor.slug}`}`;
  return c ?? null;
}

/**
 * Nome do cliente do link, para o catálogo mostrar "Pedido para". Só o nome: crédito e
 * cadastro não são públicos. Chave que não vale mais = link genérico (null).
 */
export const clienteDoLink = acao(async (vendedorSlug: string, chave: string) => {
  const c = await clientePorChave({ slug: String(vendedorSlug) }, String(chave));
  return c ? c.nome : null;
});

/** Catálogos no ar da distribuidora do vendedor do link: o de outra dona nunca aparece. */
export const catalogosDoVendedor = acao(async (vendedorSlug: string) => [
  ...(await sql<CatalogoPublico[]>`
    select ${camposCatalogo()}
      from vendedores v
      join catalogos c on c.distribuidora_id = v.distribuidora_id
      left join distribuidoras m on m.id = c.marca_id
     where v.slug = ${String(vendedorSlug)} and v.ativo and ${catalogoNoAr()}
     order by nome`),
]);

/** Cabeçalho do catálogo e as abas numa ida só: as actions do client rodam uma por vez. */
export const vitrine = acao(async (vendedorSlug: string, catalogoSlug: string) => {
  const [c] = await sql<CatalogoPublico[]>`
    select ${camposCatalogo()}
      from vendedores v
      join catalogos c on c.distribuidora_id = v.distribuidora_id and c.slug = ${String(catalogoSlug)}
      left join distribuidoras m on m.id = c.marca_id
     where v.slug = ${String(vendedorSlug)} and v.ativo and ${catalogoNoAr()}`;
  if (!c) return null;
  const secoes = await sql<{ id: string; nome: string }[]>`
    select id, nome from catalogo_secoes where catalogo_id = ${c.id} order by ordem, nome`;
  return { ...c, secoes: [...secoes] };
});

const filtroVitrine = z.object({
  vendedorSlug: z.string().max(100),
  /** Chave do link do cliente (?c=): o que ele mais compra vem primeiro. */
  chave: z.string().max(40).nullable(),
  catalogoId: z.string().uuid(),
  secaoId: z.string().uuid().or(z.literal("")),
  termo: z.string().max(200),
  pagina: z.number().int().min(0).max(10_000),
});

/**
 * Produtos do catálogo, uma página por vez. Os mais vendidos primeiro (mesma conta dos selos,
 * em crm.mais_vendidos); no link do cliente, antes ainda o que ele mais compra. Sem venda nos
 * 3 meses, por nome.
 */
export const produtosDaVitrine = acao(async (entrada: z.input<typeof filtroVitrine>) => {
  const f = filtroVitrine.parse(entrada);
  const cliente = f.chave ? await clientePorChave({ slug: f.vendedorSlug }, f.chave) : null;
  return [
    ...(await sql<{ id: string; codigo: string; nome: string; arquivo: string | null }[]>`
      select p.id, p.codigo, p.nome, p.arquivo
        from produtos p
        join distribuidora_produtos dp on dp.produto_id = p.id
        left join mais_vendidos mv on mv.codprod = p.cod_produto
        ${
          cliente
            ? sql`left join compras_recentes cr on cr.codprod = p.cod_produto and cr.codcli = ${cliente.codcli}`
            : sql``
        }
       where dp.catalogo_id = ${f.catalogoId}
         and p.ativo
         and exists (select 1 from catalogos c left join distribuidoras m on m.id = c.marca_id
                      where c.id = ${f.catalogoId} and ${catalogoNoAr()})
         ${f.secaoId ? sql`and dp.secao_id = ${f.secaoId}` : sql``}
         ${condicaoBusca(f.termo)}
       -- O ERP repete nome: sem desempate a rolagem repete um card e perde outro.
       order by ${cliente ? sql`coalesce(cr.pedidos, 0) desc,` : sql``} coalesce(mv.pedidos, 0) desc,
                p.nome, p.id
       limit ${PAGINA_VITRINE} offset ${f.pagina * PAGINA_VITRINE}`),
  ];
});

/**
 * Mais vendidos do catálogo, das vendas do ERP dos últimos 3 meses (crm.compras_recentes e
 * crm.mais_vendidos, recalculadas toda noite). Com a chave do link: os que esse cliente
 * pediu em 2 pedidos ou mais, até 10. Sem chave, ou se ele não tem compra assim: os 20 que
 * mais entraram em pedidos de todos os clientes. Medida em pedidos, não em quantidade.
 */
export const maisVendidos = acao(
  async (vendedorSlug: string, catalogoId: string, chave: string | null) => {
    const id = z.string().uuid().parse(catalogoId);
    const cliente = chave
      ? await clientePorChave({ slug: String(vendedorSlug) }, String(chave))
      : null;
    const doCatalogo = sql`
      from produtos p
      join distribuidora_produtos dp on dp.produto_id = p.id and dp.catalogo_id = ${id}`;
    const noAr = sql`
      p.ativo and exists (select 1 from catalogos c left join distribuidoras m on m.id = c.marca_id
                           where c.id = ${id} and ${catalogoNoAr()})`;
    type Produto = { id: string; codigo: string; nome: string; arquivo: string | null };
    if (cliente) {
      const doCliente = await sql<Produto[]>`
        select p.id, p.codigo, p.nome, p.arquivo ${doCatalogo}
        join compras_recentes r on r.codprod = p.cod_produto and r.codcli = ${cliente.codcli}
       where ${noAr} and r.pedidos >= 2
       order by r.pedidos desc, p.nome
       limit 10`;
      if (doCliente.length) return { doCliente: true, produtos: [...doCliente] };
    }
    const geral = await sql<Produto[]>`
      select p.id, p.codigo, p.nome, p.arquivo ${doCatalogo}
      join mais_vendidos r on r.codprod = p.cod_produto
     where ${noAr}
     order by r.pedidos desc, p.nome
     limit 20`;
    return { doCliente: false, produtos: [...geral] };
  },
);

// Os limites são os CHECKs do banco: campo gigante não entra.
const pedidoSchema = z.object({
  vendedorId: z.string().uuid(),
  catalogoId: z.string().uuid(),
  clienteNome: z.string().trim().max(120, "Nome com no máximo 120 caracteres."),
  observacao: z.string().trim().max(500, "Observação com no máximo 500 caracteres."),
  /** Chave do link do cliente (?c=); sem ela, o nome digitado vale. */
  chave: z.string().max(40).nullish(),
  /** Celular de quem pede: obrigatório no link geral (sem a chave). */
  telefone: z.string().max(20).nullish(),
  itens: z
    .array(
      z.object({
        codigo: z.string().min(1).max(60),
        nome: z.string().min(1).max(200),
        quantidade: z.number().int().min(1).max(9999),
        unidade: z.enum(UNIDADES.map((u) => u.valor) as [Unidade, ...Unidade[]]),
      }),
    )
    .min(1)
    .max(2000),
});

export const criarPedido = acao(async (entrada: z.input<typeof pedidoSchema>) => {
  const p = pedidoSchema.parse(entrada);
  const ip = await ipDaRequisicao();
  // Freio de spam por origem. Guarda o md5 do IP, não o IP: agrupa rajadas sem
  // virar cadastro de endereço de ninguém. Sem IP (dev local), sem freio.
  const origem = ip ? createHash("md5").update(ip).digest("hex") : null;

  // O catálogo tem que ser da distribuidora do vendedor e estar no ar: uma página
  // aberta antes de o catálogo sair do ar não grava pedido. Fora da transação: o
  // fragmento de `sql` não entra numa query de `tx`.
  const [dona] = await sql<{ distribuidora_id: string }[]>`
    select c.distribuidora_id
      from vendedores v
      join catalogos c on c.id = ${p.catalogoId} and c.distribuidora_id = v.distribuidora_id
      left join distribuidoras m on m.id = c.marca_id
     where v.id = ${p.vendedorId} and v.ativo and ${catalogoNoAr()}`;
  if (!dona)
    throw new Recusa("Este catálogo não está mais disponível. Peça um novo link ao vendedor.");
  // O cliente sai da chave, nunca do navegador. Chave que não vale mais: pedido sem cliente,
  // como no link genérico.
  const cliente = p.chave ? await clientePorChave({ id: p.vendedorId }, p.chave) : null;
  // Link geral: o celular é obrigatório e é por ele que o pedido tenta achar o cliente.
  const celular = p.telefone && celularValido(p.telefone) ? somenteDigitos(p.telefone) : null;
  if (!p.chave && !celular)
    throw new Recusa("Informe seu celular com DDD, no formato (92) 99999-9999.");

  return sql.begin(async (tx) => {
    if (origem) {
      // count(*) sem GROUP BY sempre devolve uma linha; noUncheckedIndexedAccess
      // não sabe disso, daí o ?? 0 em vez de desestruturar direto.
      const [linha] = await tx<{ recentes: number }[]>`
        select count(*)::int as recentes from pedidos
         where origem_hash = ${origem} and created_at > now() - interval '1 minute'`;
      if ((linha?.recentes ?? 0) >= 10)
        throw new Recusa("Muitos pedidos seguidos. Espere um minuto e tente de novo.");
    }
    // Sem a chave, o cliente sai do celular, como na conversa: os contatos do CRM, os do
    // ERP e o telefone do cadastro. Vários clientes no mesmo número: vale o da carteira;
    // ainda empatado, nenhum, e o vendedor identifica na tela do pedido.
    const codcli =
      cliente?.codcli ?? (celular ? await clientePeloTelefone(tx, p.vendedorId, celular) : null);
    // total_itens é recalculado pelo trigger de pedido_itens; aqui só passa o CHECK > 0.
    const [pedido] = await tx<{ id: string }[]>`
      insert into pedidos (vendedor_id, catalogo_id, distribuidora_id, cliente_nome, codcli,
                           telefone, observacao, total_itens, origem_hash)
      values (${p.vendedorId}, ${p.catalogoId}, ${dona.distribuidora_id},
              ${cliente?.nome ?? (p.clienteNome || null)}, ${codcli}, ${celular},
              ${p.observacao || null}, ${p.itens.reduce((s, i) => s + i.quantidade, 0)}, ${origem})
      returning id`;
    // O codprod de cada item é o gatilho do banco que acha (pedido_item_codprod). Sem o
    // genérico no tx: com ele, o postgres.js não aceita o auxiliar de inserção em lote.
    type Gravado = { codigo: string; codprod: number | null };
    const gravados: readonly Gravado[] = await tx`
      insert into pedido_itens ${tx(
        p.itens.map((i) => ({ pedido_id: pedido!.id, ...i })),
        "pedido_id",
        "codigo",
        "nome",
        "quantidade",
        "unidade",
      )}
      returning codigo, codprod`;
    // A mensagem do WhatsApp leva os mesmos códigos que ficaram no pedido.
    return {
      id: pedido!.id,
      codprods: Object.fromEntries(gravados.map((i) => [i.codigo, i.codprod])),
    };
  });
});
