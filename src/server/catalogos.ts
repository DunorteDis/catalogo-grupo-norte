"use server";

import type { TransactionSql } from "postgres";
import { z } from "zod";

import {
  MAX_CODIGOS_COLADOS,
  MAX_IMAGEM,
  PAGINA_CATALOGO,
  TIPOS_IMAGEM,
  parseCodigos,
  slugify,
  umCadastroPorCodigo,
} from "@/lib/catalogo";
import { acao, Recusa } from "@/server/acao";
import { camposCatalogo, condicaoBusca, sql } from "@/server/db";
import { exigirAdmin, exigirTI } from "@/server/sessao";

// Distribuidora (Abastex, Dunorte...) é o cadastro do TI: quem usa o sistema e as
// marcas. Catálogo é de uma distribuidora (a dona) e, se for de marca, usa nome,
// logo e cor da marca; sem marca, é o personalizado.

/** Cadastro do TI. */
export const listarDistribuidoras = acao(async () => {
  await exigirTI();
  return [
    ...(await sql<
      {
        id: string;
        nome: string;
        slug: string;
        cor: string;
        logo_url: string | null;
        ativo: boolean;
      }[]
    >`select id, nome, slug, cor, logo_url, ativo from distribuidoras order by nome`),
  ];
});

const distribuidoraSchema = z.object({
  nome: z.string().trim().min(1, "Dê um nome à distribuidora."),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida."),
  // Só o que enviarImagem devolve: a imagem fica em crm.imagens.
  logoUrl: z.string().regex(/^\/imagens\/[0-9a-f-]{36}$/, "Escolha o logo da distribuidora."),
});

/** Distribuidora nova, pelo TI. O slug sai do nome e vai nos links dos catálogos da marca. */
export const criarDistribuidora = acao(async (entrada: z.input<typeof distribuidoraSchema>) => {
  await exigirTI();
  const d = distribuidoraSchema.parse(entrada);
  const slug = slugify(d.nome);
  if (!slug) throw new Recusa("Dê um nome à distribuidora.");
  try {
    await sql`
      insert into distribuidoras (nome, slug, cor, logo_url)
      values (${d.nome}, ${slug}, ${d.cor}, ${d.logoUrl})`;
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      throw new Recusa("Já existe uma distribuidora com esse nome.");
    throw e;
  }
});

/**
 * Desligada, tira do ar tudo dela: o login dos usuários, os catálogos dela e os
 * catálogos de outras distribuidoras com a marca dela (catalogoNoAr, em db.ts).
 */
export const ativarDistribuidora = acao(async (id: string, ativo: boolean) => {
  await exigirTI();
  await sql`update distribuidoras set ativo = ${ativo} where id = ${z.string().uuid().parse(id)}`;
});

export type Catalogo = {
  id: string;
  nome: string;
  slug: string;
  cor: string;
  emoji: string | null;
  imagem_url: string | null;
  logo_url: string | null;
  marca_id: string | null;
  personalizado: boolean;
  ativo: boolean;
};
export type Secao = { id: string; nome: string; ordem: number };
type ProdutoResumo = { id: string; codigo: string; nome: string; arquivo: string | null };

/** Recusa catálogo de outra distribuidora: um id colado de fora não passa. */
async function exigirCatalogo(catalogoId: string, dist: string) {
  const [c] = await sql`
    select 1 from catalogos
     where id = ${z.string().uuid().parse(catalogoId)} and distribuidora_id = ${dist}`;
  if (!c) throw new Recusa("Catálogo não encontrado.");
}

/** Seção de destino tem que ser do mesmo catálogo. */
async function exigirSecao(secaoId: string | null, catalogoId: string) {
  if (!secaoId) return;
  const [x] = await sql`
    select 1 from catalogo_secoes
     where id = ${z.string().uuid().parse(secaoId)} and catalogo_id = ${catalogoId}`;
  if (!x) throw new Recusa("Seção não encontrada.");
}

/** Seções só por id (renomear, ordenar, excluir) filtram pela dona no próprio SQL. */
const daDona = (dist: string) =>
  sql`catalogo_id in (select id from catalogos where distribuidora_id = ${dist})`;

export const listarCatalogos = acao(async () => {
  const s = await exigirAdmin();
  return [
    ...(await sql<Catalogo[]>`
      select ${camposCatalogo()}
        from catalogos c left join distribuidoras m on m.id = c.marca_id
       where c.distribuidora_id = ${s.dist}
       order by nome`),
  ];
});

/** Marcas ativas que a distribuidora em uso ainda não tem como catálogo. */
export const marcasDisponiveis = acao(async () => {
  const s = await exigirAdmin();
  return [
    ...(await sql<
      { id: string; nome: string; slug: string; cor: string; logo_url: string | null }[]
    >`
      select d.id, d.nome, d.slug, d.cor, d.logo_url from distribuidoras d
       where d.ativo
         and not exists (select 1 from catalogos c
                          where c.distribuidora_id = ${s.dist} and c.marca_id = d.id)
       order by d.nome`),
  ];
});

/** Catálogo com a marca de uma distribuidora: nome, logo e cor vêm dela; o link é o slug dela. */
export const criarCatalogoDeMarca = acao(async (marcaId: string) => {
  const s = await exigirAdmin();
  const id = z.string().uuid().parse(marcaId);
  const [m] = await sql<{ slug: string; nome: string }[]>`
    select slug, nome from distribuidoras where id = ${id} and ativo`;
  if (!m) throw new Recusa("Distribuidora não encontrada.");
  try {
    const [novo] = await sql<{ id: string }[]>`
      insert into catalogos (distribuidora_id, marca_id, slug)
      values (${s.dist}, ${id}, ${m.slug})
      returning id`;
    return { id: novo!.id, nome: m.nome };
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      throw new Recusa(
        `Já existe um catálogo ${m.nome}, ou com o mesmo link, nesta distribuidora.`,
      );
    throw e;
  }
});

export const ativarCatalogo = acao(async (id: string, ativo: boolean) => {
  const s = await exigirAdmin();
  await sql`
    update catalogos set ativo = ${ativo}
     where id = ${z.string().uuid().parse(id)} and distribuidora_id = ${s.dist}`;
});

export const secoesDoCatalogo = acao(async (catalogoId: string) => {
  const s = await exigirAdmin();
  await exigirCatalogo(catalogoId, s.dist);
  return [
    ...(await sql<Secao[]>`
      select id, nome, ordem from catalogo_secoes
       where catalogo_id = ${catalogoId} order by ordem, nome`),
  ];
});

/** O catálogo em si: busca e contagem valem sobre o que está nele, não sobre o cadastro. */
export const itensDoCatalogo = acao(
  async (f: { catalogoId: string; secaoId: string; termo: string; pagina: number }) => {
    const s = await exigirAdmin();
    await exigirCatalogo(f.catalogoId, s.dist);
    const onde = () => sql`
      dp.catalogo_id = ${f.catalogoId}
      ${f.secaoId ? sql`and dp.secao_id = ${f.secaoId}` : sql``}
      ${condicaoBusca(f.termo)}`;
    const [linhas, [contagem]] = await Promise.all([
      sql<(ProdutoResumo & { secao_id: string | null })[]>`
        select p.id, p.codigo, p.nome, p.arquivo, dp.secao_id
          from distribuidora_produtos dp join produtos p on p.id = dp.produto_id
         where ${onde()}
         -- dp.id desempata nome repetido; sem ele a paginação repete e perde item.
         order by p.nome, dp.id
         limit ${PAGINA_CATALOGO} offset ${f.pagina * PAGINA_CATALOGO}`,
      sql<{ total: number }[]>`
        select count(*)::int as total
          from distribuidora_produtos dp join produtos p on p.id = dp.produto_id
         where ${onde()}`,
    ]);
    return {
      linhas: linhas.map(({ secao_id, ...produto }) => ({ produto, secaoId: secao_id })),
      total: contagem?.total ?? 0,
    };
  },
);

/** Cadastro completo, para o modal de adicionar. Produto é compartilhado entre todas. */
export const cadastroParaAdicionar = acao(async (termo: string, pagina: number) => {
  await exigirAdmin();
  const [linhas, [contagem]] = await Promise.all([
    sql<ProdutoResumo[]>`
      select p.id, p.codigo, p.nome, p.arquivo from produtos p
       where true ${condicaoBusca(termo)}
       order by p.nome, p.id
       limit ${PAGINA_CATALOGO} offset ${pagina * PAGINA_CATALOGO}`,
    sql<{ total: number }[]>`
      select count(*)::int as total from produtos p where true ${condicaoBusca(termo)}`,
  ]);
  return { linhas: [...linhas], total: contagem?.total ?? 0 };
});

/**
 * Em que seção cada linha visível do modal já está. Vai pelo id da linha, nunca
 * pelo EAN: o ERP repete código, e olhar por ele amarrava as linhas.
 */
export const jaNoCatalogo = acao(async (catalogoId: string, produtoIds: string[]) => {
  const s = await exigirAdmin();
  await exigirCatalogo(catalogoId, s.dist);
  const linhas = await sql<{ produto_id: string; secao_id: string | null }[]>`
    select produto_id, secao_id from distribuidora_produtos
     where catalogo_id = ${catalogoId} and produto_id = any(${sql.array(produtoIds)}::uuid[])`;
  return linhas.map((v): [string, string | null] => [v.produto_id, v.secao_id]);
});

/**
 * Liga produtos ao catálogo sem duplicar. O upsert grava a seção também: religar
 * um produto que já estava lá é o que o move de aba.
 */
async function vincularIds(catalogoId: string, ids: string[], secaoId: string | null) {
  // Repetido no mesmo INSERT faria o ON CONFLICT DO UPDATE falhar.
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return 0;
  await sql`
    insert into distribuidora_produtos (catalogo_id, produto_id, secao_id)
    select ${catalogoId}::uuid, unnest(${sql.array(unicos)}::uuid[]), ${secaoId}::uuid
    on conflict (catalogo_id, produto_id) do update set secao_id = excluded.secao_id`;
  return unicos.length;
}

export const vincular = acao(
  async (catalogoId: string, produtoIds: string[], secaoId: string | null) => {
    const s = await exigirAdmin();
    await exigirCatalogo(catalogoId, s.dist);
    await exigirSecao(secaoId, catalogoId);
    return vincularIds(catalogoId, produtoIds, secaoId);
  },
);

/** "Adicionar N": tudo que a busca do modal devolve, num INSERT só. */
export const vincularBusca = acao(
  async (catalogoId: string, termo: string, secaoId: string | null) => {
    const s = await exigirAdmin();
    await exigirCatalogo(catalogoId, s.dist);
    await exigirSecao(secaoId, catalogoId);
    const r = await sql`
      insert into distribuidora_produtos (catalogo_id, produto_id, secao_id)
      select ${catalogoId}::uuid, p.id, ${secaoId}::uuid from produtos p
       where true ${condicaoBusca(termo)}
      on conflict (catalogo_id, produto_id) do update set secao_id = excluded.secao_id`;
    return r.count;
  },
);

export const desvincular = acao(async (catalogoId: string, produtoIds: string[]) => {
  const s = await exigirAdmin();
  await exigirCatalogo(catalogoId, s.dist);
  const r = await sql`
    delete from distribuidora_produtos
     where catalogo_id = ${catalogoId} and produto_id = any(${sql.array(produtoIds)}::uuid[])`;
  return r.count;
});

/** "Remover N": o que está à vista — a aba aberta também filtra. */
export const desvincularBusca = acao(async (catalogoId: string, secaoId: string, termo: string) => {
  const s = await exigirAdmin();
  await exigirCatalogo(catalogoId, s.dist);
  const r = await sql`
      delete from distribuidora_produtos dp using produtos p
       where p.id = dp.produto_id
         and dp.catalogo_id = ${catalogoId}
         ${secaoId ? sql`and dp.secao_id = ${secaoId}` : sql``}
         ${condicaoBusca(termo)}`;
  return r.count;
});

export const colarCodigos = acao(
  async (catalogoId: string, texto: string, secaoId: string | null) => {
    const s = await exigirAdmin();
    await exigirCatalogo(catalogoId, s.dist);
    await exigirSecao(secaoId, catalogoId);
    const codigos = parseCodigos(texto);
    if (codigos.length === 0) throw new Recusa("Cole ao menos um código.");
    if (codigos.length > MAX_CODIGOS_COLADOS)
      throw new Recusa(
        `Cole no máximo ${MAX_CODIGOS_COLADOS} códigos por vez — vieram ${codigos.length}.`,
      );
    const linhas = await sql<{ id: string; codigo: string; noCatalogo: boolean }[]>`
      select p.id, p.codigo,
             exists (select 1 from distribuidora_produtos dp
                      where dp.produto_id = p.id and dp.catalogo_id = ${catalogoId}) as "noCatalogo"
        from produtos p
       where p.codigo = any(${sql.array(codigos)})
       order by p.created_at`;
    // Colar 100 códigos tem que dar 100 produtos, mesmo com EAN repetido no ERP.
    const { achados, repetidos } = umCadastroPorCodigo(linhas);
    await vincularIds(catalogoId, [...achados.values()], secaoId);
    return { total: achados.size, repetidos, faltando: codigos.filter((c) => !achados.has(c)) };
  },
);

/** Substitui o bucket do Storage: a imagem fica no banco e sai por /imagens/<id>. */
// ponytail: imagem trocada ou órfã (troca, salvar que falha, catálogo excluído) fica em crm.imagens; limpar as não referenciadas quando o banco pesar.
export const enviarImagem = acao(async (dados: FormData) => {
  await exigirAdmin();
  const arquivo = dados.get("arquivo");
  if (!(arquivo instanceof File)) throw new Recusa("Escolha uma imagem.");
  if (!TIPOS_IMAGEM.includes(arquivo.type))
    throw new Recusa("Use uma imagem PNG, JPG, WEBP ou GIF.");
  if (arquivo.size > MAX_IMAGEM)
    throw new Recusa("A imagem passa de 2 MB. Diminua o tamanho e tente de novo.");
  const [img] = await sql<{ id: string }[]>`
    insert into imagens (tipo, dados)
    values (${arquivo.type}, ${Buffer.from(await arquivo.arrayBuffer())})
    returning id`;
  return `/imagens/${img!.id}`;
});

const catalogoSchema = z.object({
  nome: z.string().trim().min(1, "Dê um nome ao catálogo."),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida."),
  // [...s] conta por code point, como o char_length do banco: emoji de família
  // passa de 8 unidades UTF-16 sem passar de 8 code points.
  emoji: z
    .string()
    .trim()
    .nullable()
    .refine((s) => s === null || [...s].length <= 8, "Use um emoji só."),
  imagemUrl: z.string().nullable(),
  copiarDe: z.string(),
});

/** Duplica o catálogo de origem: seções nascem de novo e cada vínculo vai para a de mesmo nome. */
async function copiarCatalogo(tx: TransactionSql, origemId: string, destinoId: string) {
  await tx`
    insert into catalogo_secoes (catalogo_id, nome, ordem)
    select ${destinoId}::uuid, nome, ordem from catalogo_secoes where catalogo_id = ${origemId}`;
  await tx`
    insert into distribuidora_produtos (catalogo_id, produto_id, secao_id)
    select ${destinoId}::uuid, dp.produto_id, destino.id
      from distribuidora_produtos dp
      left join catalogo_secoes origem on origem.id = dp.secao_id
      left join catalogo_secoes destino
             on destino.catalogo_id = ${destinoId} and destino.nome = origem.nome
     where dp.catalogo_id = ${origemId}
    on conflict (catalogo_id, produto_id) do nothing`;
}

/** Personalizado: cria ou edita, sempre na distribuidora em uso. */
export const salvarCatalogo = acao(
  async (editandoId: string | null, entrada: z.input<typeof catalogoSchema>) => {
    const s = await exigirAdmin();
    const c = catalogoSchema.parse(entrada);
    if (c.copiarDe) await exigirCatalogo(c.copiarDe, s.dist);
    // Emoji e imagem se excluem: o que não foi escolhido vai nulo.
    const campos = { nome: c.nome, cor: c.cor, emoji: c.emoji || null, imagem_url: c.imagemUrl };
    try {
      if (editandoId) {
        // O slug não muda ao renomear: é ele que está nos links já enviados aos clientes.
        // ponytail: sem <T[]> aqui — com o helper sql(campos, ...) o postgres.js tipa o
        // argumento como array readonly e o TS recusa o await (TS2345).
        const [salvo] = (await sql`
          update catalogos set ${sql(campos, "nome", "cor", "emoji", "imagem_url")}
           where id = ${editandoId} and distribuidora_id = ${s.dist} and marca_id is null
          returning id, nome`) as { id: string; nome: string }[];
        if (!salvo) throw new Recusa("Catálogo não encontrado.");
        return salvo;
      }
      const slug = slugify(c.nome);
      if (!slug) throw new Recusa("Dê um nome ao catálogo.");
      // Transação: se a cópia falhar, o catálogo novo não fica pela metade.
      return await sql.begin(async (tx) => {
        const [novo] = (await tx`
          insert into catalogos ${tx(
            { ...campos, slug, distribuidora_id: s.dist },
            "nome",
            "cor",
            "emoji",
            "imagem_url",
            "slug",
            "distribuidora_id",
          )}
          returning id, nome`) as { id: string; nome: string }[];
        if (c.copiarDe) await copiarCatalogo(tx, c.copiarDe, novo!.id);
        return novo!;
      });
    } catch (e) {
      if ((e as { code?: string }).code === "23505")
        throw new Recusa("Já existe um catálogo com esse link nesta distribuidora. Mude o nome.");
      throw e;
    }
  },
);

export const excluirCatalogo = acao(async (id: string) => {
  const s = await exigirAdmin();
  // Vínculos e seções saem junto (cascade); o pedido fica, com a dona gravada nele.
  await sql`
    delete from catalogos where id = ${z.string().uuid().parse(id)} and distribuidora_id = ${s.dist}`;
});

export const criarSecao = acao(async (catalogoId: string, nome: string) => {
  const s = await exigirAdmin();
  await exigirCatalogo(catalogoId, s.dist);
  const limpo = String(nome ?? "").trim();
  if (!limpo) throw new Recusa("Dê um nome à seção.");
  const [x] = await sql<{ id: string }[]>`
    insert into catalogo_secoes (catalogo_id, nome, ordem)
    values (${catalogoId}, ${limpo},
            (select count(*) from catalogo_secoes where catalogo_id = ${catalogoId}))
    returning id`;
  return x!.id;
});

export const renomearSecao = acao(async (id: string, nome: string) => {
  const s = await exigirAdmin();
  const limpo = String(nome ?? "").trim();
  if (!limpo) throw new Recusa("Dê um nome à seção.");
  await sql`update catalogo_secoes set nome = ${limpo} where id = ${id} and ${daDona(s.dist)}`;
});

/**
 * ponytail: regrava a ordem inteira em vez de trocar duas linhas — são poucas
 * seções, e assim a lista se conserta sozinha se a ordem repetir.
 */
export const ordenarSecoes = acao(async (ids: string[]) => {
  const s = await exigirAdmin();
  await sql.begin((tx) =>
    ids.map(
      (id, ordem) => tx`
        update catalogo_secoes set ordem = ${ordem}
         where id = ${id}
           and catalogo_id in (select id from catalogos where distribuidora_id = ${s.dist})`,
    ),
  );
});

export const excluirSecao = acao(async (id: string) => {
  const s = await exigirAdmin();
  // SET NULL na FK: os produtos da seção continuam no catálogo, sem seção.
  await sql`delete from catalogo_secoes where id = ${id} and ${daDona(s.dist)}`;
});
