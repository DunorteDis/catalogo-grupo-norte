"use server";

import { z } from "zod";

import { MAX_FOTO, PAGINA_PRODUTOS, TIPOS_IMAGEM } from "@/lib/catalogo";
import { acao, Recusa } from "@/server/acao";
import { guardarFoto } from "@/server/s3";
import { condicaoBusca, sql } from "@/server/db";
import { exigirAdmin } from "@/server/sessao";

type Produto = {
  id: string;
  codigo: string;
  nome: string;
  arquivo: string | null;
  ativo: boolean;
  cod_produto: number | null;
  nome_editado: boolean;
  /** Descrição atual no ERP, para comparar e voltar a ela no Editar. */
  descricao_erp: string | null;
};

export const listarProdutos = acao(async (termo: string, pagina: number) => {
  await exigirAdmin();
  const [linhas, [contagem]] = await Promise.all([
    sql<Produto[]>`
      select p.id, p.codigo, p.nome, p.arquivo, p.ativo, p.cod_produto, p.nome_editado,
             trim(x.descricao) as descricao_erp
        from produtos p
        left join system.pcprodut x on x.codprod = p.cod_produto
       where true ${condicaoBusca(termo)}
       -- O ERP repete nome: sem desempate a mesma linha aparece em duas páginas.
       order by p.nome, p.id
       limit ${PAGINA_PRODUTOS} offset ${pagina * PAGINA_PRODUTOS}`,
    sql<{ total: number }[]>`
      select count(*)::int as total from produtos p where true ${condicaoBusca(termo)}`,
  ]);
  return { linhas: [...linhas], total: contagem?.total ?? 0 };
});

const edicaoSchema = z.object({
  nome: z.string().trim().min(1, "Informe a descrição."),
  arquivo: z.string().trim(),
});

/** Foto arrastada no cadastro: vai para o bucket privado e volta o caminho /fotos/<chave>. */
export const enviarFotoProduto = acao(async (dados: FormData) => {
  await exigirAdmin();
  const arquivo = dados.get("arquivo");
  if (!(arquivo instanceof File)) throw new Recusa("Escolha uma foto para o produto.");
  if (!TIPOS_IMAGEM.includes(arquivo.type))
    throw new Recusa("Use uma imagem PNG, JPG, WEBP ou GIF.");
  if (arquivo.size > MAX_FOTO)
    throw new Recusa("A foto passa de 5 MB. Diminua o tamanho e tente de novo.");
  return guardarFoto(arquivo);
});

/**
 * Produto vem da system.pcprodut (sincronização diária): aqui não se cria nem se
 * apaga, só se trocam descrição e foto. O código é do ERP e não muda por aqui.
 * nome_editado liga quando a descrição salva difere da do ERP — aí a sincronização
 * para de sobrescrevê-la; voltar à do ERP desliga de novo. A pcprodut só é lida.
 */
export const editarProduto = acao(async (id: string, entrada: z.input<typeof edicaoSchema>) => {
  await exigirAdmin();
  const v = edicaoSchema.parse(entrada);
  await sql`
    update produtos p
       set nome = ${v.nome},
           arquivo = ${v.arquivo || null},
           nome_editado = ${v.nome} is distinct from
             (select trim(x.descricao) from system.pcprodut x where x.codprod = p.cod_produto)
     where p.id = ${id}`;
});

export const ativarProduto = acao(async (id: string, ativo: boolean) => {
  await exigirAdmin();
  await sql`update produtos set ativo = ${ativo} where id = ${id}`;
});
