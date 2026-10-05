"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";

import { acao, Recusa } from "@/server/acao";
import { carteiraWinthor, sql } from "@/server/db";
import { exigirAdmin, exigirLogin } from "@/server/sessao";

export type SituacaoCliente = "ativo" | "bloqueado" | "inativo";

export type ClienteCarteira = {
  codcli: number;
  cliente: string;
  cnpj: string | null;
  situacao: SituacaoCliente;
};

async function clientesDaCarteira(codusur: number) {
  const linhas = await sql<ClienteCarteira[]>`
    select codcli, trim(cliente) as cliente, nullif(trim(cnpj), '') as cnpj,
           case when bloqueio = 'S' then 'bloqueado'
                when ativo = 1 then 'ativo'
                else 'inativo' end as situacao
      from ${carteiraWinthor()} c
     where c.codusur = ${codusur}
     order by trim(cliente)`;
  // Array puro: o RowList do postgres.js carrega metadados que não precisam ir ao navegador.
  return [...linhas];
}

/** Admin: carteira de um vendedor desta distribuidora, pelo codusur dele. */
export const carteiraVendedor = acao(async (vendedorId: string) => {
  const s = await exigirAdmin();
  const id = z.string().uuid().parse(vendedorId);
  const [vendedor] = await sql<{ codusur: number | null }[]>`
    select codusur from vendedores where id = ${id} and distribuidora_id = ${s.dist}`;
  if (!vendedor) throw new Recusa("Vendedor não encontrado.");
  if (vendedor.codusur == null)
    throw new Recusa("Informe o código do usuário no Winthor para ver a carteira.");
  return clientesDaCarteira(vendedor.codusur);
});

/** Vendedor: a própria carteira. O codusur sai do cadastro dele, nunca do navegador. */
export const minhaCarteira = acao(async () => {
  const s = await exigirLogin();
  const [v] = await sql<{ nome: string; codusur: number | null }[]>`
    select nome, codusur from vendedores where user_id = ${s.sub}`;
  if (!v) throw new Recusa("A carteira é do vendedor: seu acesso não tem cadastro de vendedor.");
  if (v.codusur == null)
    throw new Recusa(
      "Seu cadastro ainda não tem o código do Winthor. Peça ao administrador para informar.",
    );
  return { nome: v.nome, codusur: v.codusur, clientes: await clientesDaCarteira(v.codusur) };
});

/**
 * Vendedor só mexe em cliente da própria carteira, de quem conversa com ele pelo WhatsApp
 * ou de um pedido dele (quem compra pode não ser da carteira).
 */
async function exigirClienteDoVendedor(userId: string, codcli: number) {
  const [dono] = await sql<{ ok: boolean }[]>`
    select exists (
      select 1 from vendedores v join ${carteiraWinthor()} k on k.codusur = v.codusur
       where v.user_id = ${userId} and k.codcli = ${codcli}
      union all
      select 1 from vendedores v join conversas c on c.vendedor_id = v.id
       where v.user_id = ${userId} and c.codcli = ${codcli}
      union all
      select 1 from vendedores v join pedidos p on p.vendedor_id = v.id
       where v.user_id = ${userId} and p.codcli = ${codcli}) as ok`;
  if (!dono?.ok) throw new Recusa("Esse cliente não está na sua carteira.");
}

/**
 * Chave do cliente para o link do catálogo (/c/<vendedor>/<catálogo>?c=<chave>): o pedido
 * feito por ele chega identificado. Vale para qualquer catálogo do vendedor; o catálogo
 * quem escolhe é o vendedor, na tela. A chave é a mesma toda vez; `novo` sorteia outra e
 * a antiga para de valer (link que vazou).
 */
export const chaveDoCliente = acao(async (entrada: number, novoLink?: boolean) => {
  const s = await exigirLogin();
  const codcli = z.number().int().positive().parse(entrada);
  const novo = novoLink === true;
  const [v] = await sql<{ id: string }[]>`
    select id from vendedores where user_id = ${s.sub} and ativo`;
  if (!v)
    throw new Recusa("O link do catálogo é do vendedor: seu acesso não tem cadastro de vendedor.");
  await exigirClienteDoVendedor(s.sub, codcli);
  const chave = randomBytes(9).toString("base64url");
  const [link] = await sql<{ chave: string }[]>`
    insert into links_cliente (chave, vendedor_id, codcli)
    values (${chave}, ${v.id}, ${codcli})
    on conflict (vendedor_id, codcli) do update
      set chave = case when ${novo}::boolean then excluded.chave else links_cliente.chave end,
          criado_em = case when ${novo}::boolean then now() else links_cliente.criado_em end
    returning chave`;
  return link!.chave;
});

export type CondicoesCliente = {
  cliente: {
    codcli: number;
    nome: string;
    razao: string;
    cnpj: string | null;
    cidade: string | null;
    uf: string | null;
    ativo: boolean;
    bloqueado: boolean;
    bloqueioDefinitivo: boolean;
    motivoBloqueio: string | null;
    bloqueadoEm: string | null;
    limite: number;
    limiteVence: string | null;
    credito: number;
    obsCredito: string | null;
    cobranca: string | null;
    plano: number | null;
    ultimaCompra: string | null;
    cadastro: string | null;
  };
  titulos: {
    documento: string;
    cobranca: string | null;
    emissao: string | null;
    vencimento: string;
    diasAtraso: number;
    valor: number;
    pago: number;
    saldo: number;
  }[];
  creditos: { data: string | null; valor: number; historico: string | null; nota: number | null }[];
};

/**
 * Crédito, títulos em aberto e bloqueio de um cliente, do Winthor (pcclient) e do
 * portal_vendedor. Vendedor só abre cliente da própria carteira; admin abre qualquer um.
 * Título de verba (codcob VERB) não é dívida do cliente e fica de fora.
 */
export const condicoesCliente = acao(async (entrada: number): Promise<CondicoesCliente> => {
  const s = await exigirLogin();
  const codcli = z.number().int().positive().parse(entrada);
  if (s.papel === "vendedor") await exigirClienteDoVendedor(s.sub, codcli);

  const [clientes, titulos, creditos] = await Promise.all([
    sql<CondicoesCliente["cliente"][]>`
      select c.codcli,
             coalesce(case when c.fantasia ~ '[A-Za-z]' then trim(c.fantasia) end, trim(c.cliente)) as nome,
             trim(c.cliente) as razao, nullif(trim(c.cgcent), '') as cnpj,
             nullif(trim(c.municent), '') as cidade, nullif(trim(c.estent), '') as uf,
             c.dtexclusao is null as ativo,
             coalesce(c.bloqueio = 'S', false) as bloqueado,
             coalesce(c.bloqueiodefinitivo = 'S', false) as "bloqueioDefinitivo",
             nullif(trim(c.motivobloq), '') as "motivoBloqueio", c.dtbloq as "bloqueadoEm",
             coalesce(c.limcred, 0)::float8 as limite, c.dtvenclimcred as "limiteVence",
             coalesce(c.vlcredcli, 0)::float8 as credito,
             nullif(trim(c.obscredito), '') as "obsCredito",
             nullif(trim(c.codcob), '') as cobranca, c.codplpag as plano,
             c.dtultcomp as "ultimaCompra", c.dtcadastro as cadastro
        from system.pcclient c where c.codcli = ${codcli}`,
    sql<CondicoesCliente["titulos"]>`
      select concat(duplic, '-', prest) as documento, nullif(trim(codcob), '') as cobranca,
             dtemissao as emissao, dtvenc as vencimento,
             (current_date - dtvenc::date) as "diasAtraso",
             coalesce(valor, 0)::float8 as valor, coalesce(vpago, 0)::float8 as pago,
             coalesce(saldo_devedor, 0)::float8 as saldo
        from portal_vendedor.cliente_pendencias
       where codcli = ${codcli} and coalesce(codcob, '') <> 'VERB'
       order by dtvenc, duplic, prest`,
    sql<CondicoesCliente["creditos"]>`
      select dtlanc as data, coalesce(valor, 0)::float8 as valor,
             nullif(trim(historico), '') as historico, numnota as nota
        from portal_vendedor.credito_cliente
       where codcli = ${codcli} and dtdesconto is null
       order by dtlanc desc`,
  ]);
  const cliente = clientes[0];
  if (!cliente) throw new Recusa("Cliente não encontrado no Winthor.");
  return { cliente, titulos: [...titulos], creditos: [...creditos] };
});

export type HistoricoCliente = {
  resumo: {
    pedidos: number;
    faturado: number;
    ultimaCompra: string | null;
    desde: string | null;
  };
  pedidos: {
    numped: string;
    data: string | null;
    posicao: string | null;
    valor: number;
    valorFaturado: number | null;
    itens: number;
    nota: string | null;
    entrega: string | null;
    situacaoEntrega: string | null;
  }[];
  produtos: {
    codprod: number;
    nome: string;
    codigo: string | null;
    arquivo: string | null;
    pedidos: number;
    qtdTotal: number | null;
    ultimaCompra: string | null;
    ultimoPreco: number | null;
    ultimaQtd: number | null;
  }[];
};

/**
 * Histórico do cliente nas vendas do ERP (últimos ~3 meses, que é o que a tabela guarda):
 * os pedidos e, por produto, em quantos pedidos entrou, a última compra e o preço pago nela.
 * Lê o que a tarefa noturna calculou (crm.historico_pedidos e crm.compras_recentes): a
 * tabela do ERP não tem índice e a consulta na hora levaria de segundos a um minuto.
 * Mesma regra das condições: vendedor vê os clientes dele, admin vê qualquer um. As datas
 * vão como timestamp: date viraria meia-noite UTC e, em Manaus, apareceria um dia antes.
 */
export const historicoDoCliente = acao(async (entrada: number): Promise<HistoricoCliente> => {
  const s = await exigirLogin();
  const codcli = z.number().int().positive().parse(entrada);
  if (s.papel === "vendedor") await exigirClienteDoVendedor(s.sub, codcli);

  const [resumos, pedidos, produtos] = await Promise.all([
    sql<HistoricoCliente["resumo"][]>`
      select count(*)::int as pedidos,
             coalesce(sum(valor_faturado), 0)::float8 as faturado,
             max(data)::timestamp as "ultimaCompra",
             min(data)::timestamp as desde
        from historico_pedidos where codcli = ${codcli}`,
    sql<HistoricoCliente["pedidos"]>`
      select numped::text, data::timestamp as data, posicao, coalesce(valor, 0)::float8 as valor,
             valor_faturado::float8 as "valorFaturado", itens, nota::text,
             entrega::timestamp as entrega,
             situacao_entrega as "situacaoEntrega"
        from historico_pedidos
       where codcli = ${codcli}
       order by data desc nulls last, numped desc
       limit 20`,
    sql<HistoricoCliente["produtos"]>`
      select r.codprod,
             coalesce(p.nome, (select trim(x.descricao) from system.pcprodut x
                                where x.codprod = r.codprod limit 1), r.codprod::text) as nome,
             p.codigo, p.arquivo, r.pedidos, r.qtd_total::float8 as "qtdTotal",
             r.ultima_compra::timestamp as "ultimaCompra", r.ultimo_preco::float8 as "ultimoPreco",
             r.ultima_qtd::float8 as "ultimaQtd"
        from compras_recentes r
        left join produtos p on p.cod_produto = r.codprod
       where r.codcli = ${codcli}
       order by r.pedidos desc, r.ultima_compra desc nulls last, nome`,
  ]);
  return {
    resumo: resumos[0] ?? { pedidos: 0, faturado: 0, ultimaCompra: null, desde: null },
    pedidos: [...pedidos],
    produtos: [...produtos],
  };
});

export type ItemDoPedidoErp = {
  codprod: number;
  nome: string;
  codigo: string | null;
  arquivo: string | null;
  /** Quantidade faturada; nula em pedido ainda não faturado. */
  qtd: number | null;
  valor: number;
};

/** Itens de um pedido do histórico do cliente (crm.historico_itens, da tarefa noturna). */
export const itensDoPedidoErp = acao(async (entrada: number, numpedTexto: string) => {
  const s = await exigirLogin();
  const codcli = z.number().int().positive().parse(entrada);
  const numped = z
    .string()
    .regex(/^\d{1,18}$/)
    .parse(numpedTexto);
  if (s.papel === "vendedor") await exigirClienteDoVendedor(s.sub, codcli);
  return [
    ...(await sql<ItemDoPedidoErp[]>`
      select i.codprod,
             coalesce(p.nome, (select trim(x.descricao) from system.pcprodut x
                                where x.codprod = i.codprod limit 1), i.codprod::text) as nome,
             p.codigo, p.arquivo, i.qtd::float8 as qtd, coalesce(i.valor, 0)::float8 as valor
        from historico_itens i
        left join produtos p on p.cod_produto = i.codprod
       where i.codcli = ${codcli} and i.numped = ${numped}::bigint
       order by nome`),
  ];
});
