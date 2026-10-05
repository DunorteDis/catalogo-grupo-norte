"use server";

import { z } from "zod";

import { numeroNacional, PAGINA_CLIENTES, TIPOS_CONTATO } from "@/lib/catalogo";
import { acao, Recusa } from "@/server/acao";
import { carteiraWinthor, condicaoBusca, sql } from "@/server/db";
import { exigirAdmin, exigirLogin } from "@/server/sessao";

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
  /** bloqueio = 'S' no ERP. */
  bloqueado: boolean;
  /** Do ERP mais os cadastrados aqui. */
  contatos: number;
};

export type ClienteDaBusca = {
  codcli: number;
  nome: string;
  cnpj: string | null;
  cidade: string | null;
  naCarteira: boolean;
};

/**
 * Todos os clientes ativos do Winthor, por nome, código ou CNPJ, para dizer de quem é a
 * conversa ou o pedido: quem compra pode não ser da carteira. Para o vendedor, os da
 * carteira dele vêm primeiro.
 */
export const buscarClientes = acao(async (entrada: string) => {
  const s = await exigirLogin();
  const termo = z.string().max(200).parse(entrada).trim();
  if (termo.length < 2) return [];
  // CNPJ só com dígitos: acha com ou sem a pontuação digitada.
  const busca = condicaoBusca(termo, [
    sql`c.cliente`,
    sql`c.fantasia`,
    sql`c.codcli::text`,
    sql`regexp_replace(c.cgcent, '[^0-9]', '', 'g')`,
  ]);
  // A carteira sai uma vez e entra por join: um exists por cliente achado levava ~0,6 s.
  const linhas = await sql<ClienteDaBusca[]>`
    with minha as (
      select distinct k.codcli from vendedores v join ${carteiraWinthor()} k on k.codusur = v.codusur
       where v.user_id = ${s.sub})
    select c.codcli,
           coalesce(case when c.fantasia ~ '[A-Za-z]' then trim(c.fantasia) end, trim(c.cliente)) as nome,
           nullif(trim(c.cgcent), '') as cnpj,
           nullif(trim(c.municent) || coalesce('/' || trim(c.estent), ''), '') as cidade,
           m.codcli is not null as "naCarteira"
      from system.pcclient c left join minha m on m.codcli = c.codcli
     where c.dtexclusao is null ${busca}
     order by "naCarteira" desc, nome, c.codcli
     limit 30`;
  return [...linhas];
});

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
             coalesce(c.bloqueio = 'S', false) as bloqueado,
             (select count(*)::int from system.pccontato x where x.codcli = c.codcli)
           + (nullif(trim(c.telent1), '') is not null)::int
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

/**
 * Os do ERP, só leitura: os da system.pccontato e o telent1 do cadastro na
 * system.pcclient. E os cadastrados aqui (crm.cliente_contatos).
 */
export const contatosDoCliente = acao(async (codcli: number) => {
  await exigirAdmin();
  const [erp, proprios] = await Promise.all([
    sql<{ chave: string; nome: string; celular: string | null }[]>`
      select codcontato::text as chave, trim(nomecontato) as nome,
             coalesce(nullif(trim(celular), ''), nullif(trim(telefone), '')) as celular, 1 as ordem
        from system.pccontato where codcli = ${codcli}
      union all
      select 'telent1', 'Telefone do cadastro', trim(telent1), 2
        from system.pcclient where codcli = ${codcli} and nullif(trim(telent1), '') is not null
       order by ordem, nome`,
    sql<{ id: string; nome: string; tipo: string | null; celular: string }[]>`
      select id, nome, tipo, celular from cliente_contatos where codcli = ${codcli}
       order by created_at, id`,
  ]);
  return { erp: [...erp], proprios: [...proprios] };
});

const contatoSchema = z.object({
  codcli: z.number().int(),
  /** Sem id = contato novo. */
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(1, "Informe o nome do contato."),
  tipo: z.enum(TIPOS_CONTATO, { message: "Escolha um tipo da lista." }).nullable(),
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
        update cliente_contatos
           set nome = ${v.nome}, tipo = ${v.tipo}, celular = ${celular}, updated_at = now()
         where id = ${v.id} and codcli = ${v.codcli}
        returning id`;
      if (!feito.length) throw new Recusa("Esse contato não existe mais. Feche e abra de novo.");
    } else {
      const [cliente] = await sql`select 1 from system.pcclient where codcli = ${v.codcli}`;
      if (!cliente) throw new Recusa("Cliente não encontrado no ERP.");
      await sql`
        insert into cliente_contatos (codcli, nome, tipo, celular)
        values (${v.codcli}, ${v.nome}, ${v.tipo}, ${celular})`;
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
  await sql.begin(async (tx) => {
    const [k] = await tx<{ codcli: number; celular: string }[]>`
      delete from cliente_contatos where id = ${z.string().uuid().parse(id)}
      returning codcli, celular`;
    // A conversa do WhatsApp identificada por esse número deixa de ser desse cliente.
    if (k)
      await tx`
        update conversas set codcli = null
         where codcli = ${k.codcli}
           and crm.chave_telefone(telefone) = crm.chave_telefone(${k.celular})`;
  });
});
