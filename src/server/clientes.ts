"use server";

import { z } from "zod";

import { numeroNacional, PAGINA_CLIENTES } from "@/lib/catalogo";
import { acao, Recusa } from "@/server/acao";
import { condicaoBusca, sql } from "@/server/db";
import { exigirAdmin } from "@/server/sessao";

export type Situacao = "ativos" | "inativos" | "todos";

export type Cliente = {
  codcli: number;
  cliente: string;
  /** O que a tela mostra: a fantasia, ou a razão social quando a fantasia é lixo ("****", CPF). */
  nome: string;
  cgcent: string | null;
  municent: string | null;
  estent: string | null;
  /** Sem dtexclusao no ERP = ativo. */
  ativo: boolean;
  /** Do ERP mais os cadastrados aqui. */
  contatos: number;
};

/** Cliente vem da system.pcclient: aqui só se lê. */
export const listarClientes = acao(async (termo: string, situacao: Situacao, pagina: number) => {
  await exigirAdmin();
  const filtro =
    situacao === "ativos"
      ? sql`c.dtexclusao is null`
      : situacao === "inativos"
        ? sql`c.dtexclusao is not null`
        : sql`true`;
  // CNPJ só com dígitos: acha com ou sem a pontuação digitada.
  const busca = condicaoBusca(termo, [
    sql`c.cliente`,
    sql`c.fantasia`,
    sql`c.codcli::text`,
    sql`regexp_replace(c.cgcent, '[^0-9]', '', 'g')`,
  ]);
  const [linhas, [contagem]] = await Promise.all([
    sql<Cliente[]>`
      select c.codcli, trim(c.cliente) as cliente,
             coalesce(case when c.fantasia ~ '[A-Za-z]' then trim(c.fantasia) end, trim(c.cliente)) as nome,
             c.cgcent, trim(c.municent) as municent, c.estent, c.dtexclusao is null as ativo,
             (select count(*)::int from system.pccontato x where x.codcli = c.codcli)
           + (select count(*)::int from cliente_contatos k where k.codcli = c.codcli) as contatos
        from system.pcclient c
       where ${filtro} ${busca}
       order by nome, c.codcli
       limit ${PAGINA_CLIENTES} offset ${pagina * PAGINA_CLIENTES}`,
    sql<{ total: number }[]>`
      select count(*)::int as total from system.pcclient c where ${filtro} ${busca}`,
  ]);
  return { linhas: [...linhas], total: contagem?.total ?? 0 };
});

/** Os do ERP (system.pccontato, só leitura) e os cadastrados aqui (crm.cliente_contatos). */
export const contatosDoCliente = acao(async (codcli: number) => {
  await exigirAdmin();
  const [erp, proprios] = await Promise.all([
    sql<{ codcontato: number; nome: string; celular: string | null }[]>`
      select codcontato, trim(nomecontato) as nome,
             coalesce(nullif(trim(celular), ''), nullif(trim(telefone), '')) as celular
        from system.pccontato where codcli = ${codcli}
       order by nomecontato`,
    sql<{ id: string; nome: string; celular: string }[]>`
      select id, nome, celular from cliente_contatos where codcli = ${codcli}
       order by created_at, id`,
  ]);
  return { erp: [...erp], proprios: [...proprios] };
});

const contatoSchema = z.object({
  codcli: z.number().int(),
  /** Sem id = contato novo. */
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(1, "Informe o nome do contato."),
  celular: z.string(),
});

export const salvarContato = acao(async (entrada: z.input<typeof contatoSchema>) => {
  await exigirAdmin();
  const v = contatoSchema.parse(entrada);
  const celular = numeroNacional(v.celular);
  if (!celular) throw new Recusa("Informe o celular com DDD, como (92) 99999-9999.");
  try {
    if (v.id) {
      const feito = await sql`
        update cliente_contatos set nome = ${v.nome}, celular = ${celular}, updated_at = now()
         where id = ${v.id} and codcli = ${v.codcli}
        returning id`;
      if (!feito.length) throw new Recusa("Esse contato não existe mais. Feche e abra de novo.");
    } else {
      const [cliente] = await sql`select 1 from system.pcclient where codcli = ${v.codcli}`;
      if (!cliente) throw new Recusa("Cliente não encontrado no ERP.");
      await sql`
        insert into cliente_contatos (codcli, nome, celular)
        values (${v.codcli}, ${v.nome}, ${celular})`;
    }
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      throw new Recusa("Esse celular já está nos contatos deste cliente.");
    throw e;
  }
});

/** Só os cadastrados aqui: a pccontato não é tocada. */
export const excluirContato = acao(async (id: string) => {
  await exigirAdmin();
  await sql`delete from cliente_contatos where id = ${z.string().uuid().parse(id)}`;
});
