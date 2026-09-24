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
import { condicaoBusca, sql } from "@/server/db";
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

export type Catalogo = {
  id: string;
  nome: string;
  slug: string;
  cor: string;
  emoji: string | null;
  imagem_url: string | null;
  personalizado: boolean;
  ativo: boolean;
};
export type Secao = { id: string; nome: string; ordem: number };
type ProdutoResumo = { id: string; codigo: string; nome: string; arquivo: string | null };

export const listarCatalogos = acao(async () => {
  await exigirAdmin();
  return [
    ...(await sql<Catalogo[]>`
      select id, nome, slug, cor, emoji, imagem_url, personalizado, ativo
        from distribuidoras order by nome`),
  ];
});

export const secoesDoCatalogo = acao(async (catalogoId: string) => {
  await exigirAdmin();
  return [
    ...(await sql<Secao[]>`
      select id, nome, ordem from catalogo_secoes
       where distribuidora_id = ${catalogoId} order by ordem, nome`),
  ];
});

/** O catálogo em si: busca e contagem valem sobre o que está nele, não sobre o cadastro. */
export const itensDoCatalogo = acao(
  async (f: { catalogoId: string; secaoId: string; termo: string; pagina: number }) => {
    await exigirAdmin();
    const onde = () => sql`
      dp.distribuidora_id = ${f.catalogoId}
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

/** Cadastro completo, para o modal de adicionar. */
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
  await exigirAdmin();
  const linhas = await sql<{ produto_id: string; secao_id: string | null }[]>`
    select produto_id, secao_id from distribuidora_produtos
     where distribuidora_id = ${catalogoId} and produto_id = any(${sql.array(produtoIds)}::uuid[])`;
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
    insert into distribuidora_produtos (distribuidora_id, produto_id, secao_id)
    select ${catalogoId}::uuid, unnest(${sql.array(unicos)}::uuid[]), ${secaoId}::uuid
    on conflict (distribuidora_id, produto_id) do update set secao_id = excluded.secao_id`;
  return unicos.length;
}

export const vincular = acao(
  async (catalogoId: string, produtoIds: string[], secaoId: string | null) => {
    await exigirAdmin();
    return vincularIds(catalogoId, produtoIds, secaoId);
  },
);

/** "Adicionar N": tudo que a busca do modal devolve, num INSERT só. */
export const vincularBusca = acao(
  async (catalogoId: string, termo: string, secaoId: string | null) => {
    await exigirAdmin();
    const r = await sql`
      insert into distribuidora_produtos (distribuidora_id, produto_id, secao_id)
      select ${catalogoId}::uuid, p.id, ${secaoId}::uuid from produtos p
       where true ${condicaoBusca(termo)}
      on conflict (distribuidora_id, produto_id) do update set secao_id = excluded.secao_id`;
    return r.count;
  },
);

export const desvincular = acao(async (catalogoId: string, produtoIds: string[]) => {
  await exigirAdmin();
  const r = await sql`
    delete from distribuidora_produtos
     where distribuidora_id = ${catalogoId} and produto_id = any(${sql.array(produtoIds)}::uuid[])`;
  return r.count;
});

/** "Remover N": o que está à vista — a aba aberta também filtra. */
export const desvincularBusca = acao(async (catalogoId: string, secaoId: string, termo: string) => {
  await exigirAdmin();
  const r = await sql`
      delete from distribuidora_produtos dp using produtos p
       where p.id = dp.produto_id
         and dp.distribuidora_id = ${catalogoId}
         ${secaoId ? sql`and dp.secao_id = ${secaoId}` : sql``}
         ${condicaoBusca(termo)}`;
  return r.count;
});

export const colarCodigos = acao(
  async (catalogoId: string, texto: string, secaoId: string | null) => {
    await exigirAdmin();
    const codigos = parseCodigos(texto);
    if (codigos.length === 0) throw new Recusa("Cole ao menos um código.");
    if (codigos.length > MAX_CODIGOS_COLADOS)
      throw new Recusa(
        `Cole no máximo ${MAX_CODIGOS_COLADOS} códigos por vez — vieram ${codigos.length}.`,
      );
    const linhas = await sql<{ id: string; codigo: string; noCatalogo: boolean }[]>`
      select p.id, p.codigo,
             exists (select 1 from distribuidora_produtos dp
                      where dp.produto_id = p.id and dp.distribuidora_id = ${catalogoId}) as "noCatalogo"
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
  if (!(arquivo instanceof File)) throw new Recusa("Escolha uma imagem para o catálogo.");
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
  // .max(8) conta unidade UTF-16, não code point: um emoji de família (pessoa+ZWJ+
  // pessoa+ZWJ+...) tem menos de 8 "caracteres" no sentido do CHECK do banco
  // (char_length, que conta code point) mas passa de 8 unidades UTF-16 e seria
  // recusado aqui mesmo sendo válido lá. [...s] itera por code point, como o banco.
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
    insert into catalogo_secoes (distribuidora_id, nome, ordem)
    select ${destinoId}::uuid, nome, ordem from catalogo_secoes where distribuidora_id = ${origemId}`;
  await tx`
    insert into distribuidora_produtos (distribuidora_id, produto_id, secao_id)
    select ${destinoId}::uuid, dp.produto_id, destino.id
      from distribuidora_produtos dp
      left join catalogo_secoes origem on origem.id = dp.secao_id
      left join catalogo_secoes destino
             on destino.distribuidora_id = ${destinoId} and destino.nome = origem.nome
     where dp.distribuidora_id = ${origemId}
    on conflict (distribuidora_id, produto_id) do nothing`;
}

export const salvarCatalogo = acao(
  async (editandoId: string | null, entrada: z.input<typeof catalogoSchema>) => {
    await exigirAdmin();
    const c = catalogoSchema.parse(entrada);
    // Emoji e imagem se excluem: o que não foi escolhido vai nulo.
    const campos = { nome: c.nome, cor: c.cor, emoji: c.emoji || null, imagem_url: c.imagemUrl };
    if (editandoId) {
      // O slug não muda ao renomear: é ele que está nos links já enviados aos clientes.
      // ponytail: sem <Catalogo[]> aqui — combinado com o helper sql(campos, ...) o
      // postgres.js tipa o argumento como array readonly e o TS recusa o await (TS2345).
      const [salvo] = (await sql`
        update distribuidoras set ${sql(campos, "nome", "cor", "emoji", "imagem_url")}
         where id = ${editandoId}
        returning id, nome, slug, cor, emoji, imagem_url, personalizado, ativo`) as Catalogo[];
      if (!salvo) throw new Recusa("Catálogo não encontrado.");
      return salvo;
    }
    const slug = slugify(c.nome);
    if (!slug) throw new Recusa("Dê um nome ao catálogo.");
    // Transação: se a cópia falhar, o catálogo novo não fica pela metade.
    return sql.begin(async (tx) => {
      // Mesmo motivo do update acima: sem <Catalogo[]> por causa do helper tx(...).
      const [novo] = (await tx`
        insert into distribuidoras ${tx(
          { ...campos, slug, personalizado: true },
          "nome",
          "cor",
          "emoji",
          "imagem_url",
          "slug",
          "personalizado",
        )}
        returning id, nome, slug, cor, emoji, imagem_url, personalizado, ativo`) as Catalogo[];
      if (c.copiarDe) await copiarCatalogo(tx, c.copiarDe, novo!.id);
      return novo!;
    });
  },
);

export const excluirCatalogo = acao(async (id: string) => {
  await exigirAdmin();
  await sql`delete from distribuidoras where id = ${id}`;
});

export const criarSecao = acao(async (catalogoId: string, nome: string) => {
  await exigirAdmin();
  const limpo = String(nome ?? "").trim();
  if (!limpo) throw new Recusa("Dê um nome à seção.");
  const [s] = await sql<{ id: string }[]>`
    insert into catalogo_secoes (distribuidora_id, nome, ordem)
    values (${catalogoId}, ${limpo},
            (select count(*) from catalogo_secoes where distribuidora_id = ${catalogoId}))
    returning id`;
  return s!.id;
});

export const renomearSecao = acao(async (id: string, nome: string) => {
  await exigirAdmin();
  const limpo = String(nome ?? "").trim();
  if (!limpo) throw new Recusa("Dê um nome à seção.");
  await sql`update catalogo_secoes set nome = ${limpo} where id = ${id}`;
});

/**
 * ponytail: regrava a ordem inteira em vez de trocar duas linhas — são poucas
 * seções, e assim a lista se conserta sozinha se a ordem repetir.
 */
export const ordenarSecoes = acao(async (ids: string[]) => {
  await exigirAdmin();
  await sql.begin((tx) =>
    ids.map((id, ordem) => tx`update catalogo_secoes set ordem = ${ordem} where id = ${id}`),
  );
});

export const excluirSecao = acao(async (id: string) => {
  await exigirAdmin();
  // SET NULL na FK: os produtos da seção continuam no catálogo, sem seção.
  await sql`delete from catalogo_secoes where id = ${id}`;
});
