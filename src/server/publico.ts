"use server";

import { createHash } from "node:crypto";
import { z } from "zod";

import type { CatalogoPublico } from "@/hooks/use-catalogos-publicos";
import { PAGINA_VITRINE, UNIDADES, type Unidade } from "@/lib/catalogo";
import { acao, Recusa } from "@/server/acao";
import { condicaoBusca, sql } from "@/server/db";
import { ipDaRequisicao } from "@/server/sessao";

// Tudo aqui é público (cliente sem login): nada de lista de vendedores.

/** UM vendedor, o do slug do link. Nome e WhatsApp da equipe inteira não são públicos. */
export const vendedorPorSlug = acao(async (slug: string) => {
  const [v] = await sql<{ id: string; nome: string; whatsapp: string }[]>`
    select id, nome, whatsapp from vendedores where slug = ${String(slug)} and ativo`;
  return v ?? null;
});

export const catalogosPublicos = acao(async () => [
  ...(await sql<CatalogoPublico[]>`
    select id, nome, slug, cor, emoji, imagem_url, personalizado
      from distribuidoras where ativo order by nome`),
]);

/** Cabeçalho do catálogo e as abas numa ida só: as actions do client rodam uma por vez. */
export const vitrine = acao(async (distribuidoraSlug: string) => {
  const [d] = await sql<
    { id: string; nome: string; cor: string; emoji: string | null; imagem_url: string | null }[]
  >`
    select id, nome, cor, emoji, imagem_url
      from distribuidoras where slug = ${String(distribuidoraSlug)} and ativo`;
  if (!d) return null;
  const secoes = await sql<{ id: string; nome: string }[]>`
    select id, nome from catalogo_secoes where distribuidora_id = ${d.id} order by ordem, nome`;
  return { ...d, secoes: [...secoes] };
});

const filtroVitrine = z.object({
  distribuidoraId: z.string().uuid(),
  secaoId: z.string().uuid().or(z.literal("")),
  termo: z.string().max(200),
  pagina: z.number().int().min(0).max(10_000),
});

export const produtosDaVitrine = acao(async (entrada: z.input<typeof filtroVitrine>) => {
  const f = filtroVitrine.parse(entrada);
  return [
    ...(await sql<{ id: string; codigo: string; nome: string; arquivo: string | null }[]>`
      select p.id, p.codigo, p.nome, p.arquivo
        from produtos p
        join distribuidora_produtos dp on dp.produto_id = p.id
       where dp.distribuidora_id = ${f.distribuidoraId}
         and p.ativo
         ${f.secaoId ? sql`and dp.secao_id = ${f.secaoId}` : sql``}
         ${condicaoBusca(f.termo)}
       -- O ERP repete nome: sem desempate a rolagem repete um card e perde outro.
       order by p.nome, p.id
       limit ${PAGINA_VITRINE} offset ${f.pagina * PAGINA_VITRINE}`),
  ];
});

// Os limites são os CHECKs do banco: campo gigante não entra.
const pedidoSchema = z.object({
  vendedorId: z.string().uuid(),
  distribuidoraId: z.string().uuid(),
  clienteNome: z.string().trim().max(120, "Nome com no máximo 120 caracteres."),
  observacao: z.string().trim().max(500, "Observação com no máximo 500 caracteres."),
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
    // total_itens é recalculado pelo trigger de pedido_itens; aqui só passa o CHECK > 0.
    const [pedido] = await tx<{ id: string }[]>`
      insert into pedidos (vendedor_id, distribuidora_id, cliente_nome, observacao, total_itens, origem_hash)
      values (${p.vendedorId}, ${p.distribuidoraId}, ${p.clienteNome || null},
              ${p.observacao || null}, ${p.itens.reduce((s, i) => s + i.quantidade, 0)}, ${origem})
      returning id`;
    await tx`
      insert into pedido_itens ${tx(
        p.itens.map((i) => ({ pedido_id: pedido!.id, ...i })),
        "pedido_id",
        "codigo",
        "nome",
        "quantidade",
        "unidade",
      )}`;
    return pedido!.id;
  });
});
