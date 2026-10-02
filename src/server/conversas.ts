"use server";

import type { JSONValue } from "postgres";
import { z } from "zod";

import { resumoMensagem, type TipoMensagem } from "@/lib/whatsapp";
import { acao, Recusa } from "@/server/acao";
import { carteiraWinthor, condicaoBusca, sql } from "@/server/db";
import { exigirLogin } from "@/server/sessao";
import { chamarWapi, conversaVisivel, numeroDoVendedor } from "@/server/whatsapp";

export type ConversaDaLista = {
  id: string;
  telefone: string;
  nome_contato: string | null;
  codcli: number | null;
  /** Nome do cliente no ERP, quando a conversa tem cliente. */
  cliente: string | null;
  ultima_mensagem: string | null;
  ultima_em: string | null;
  ultima_de_mim: boolean | null;
  nao_lidas: number;
};

export type MensagemDaConversa = {
  id: number;
  deMim: boolean;
  tipo: TipoMensagem;
  texto: string | null;
  enviadaEm: string;
  /** Nome do documento (o texto do documento com legenda é a legenda). */
  nomeArquivo: string | null;
  /** Em bytes, e páginas quando o WhatsApp informa (PDF). Só em documento. */
  tamanhoArquivo: number | null;
  paginas: number | null;
  /** A mensagem que esta responde, quando está na conversa. */
  citada: { deMim: boolean; tipo: TipoMensagem; texto: string | null } | null;
};

const POR_LOTE = 50;

async function meuVendedor() {
  const s = await exigirLogin();
  const [v] = await sql<{ id: string }[]>`select id from vendedores where user_id = ${s.sub}`;
  if (!v)
    throw new Recusa("As conversas são do vendedor: seu acesso não tem cadastro de vendedor.");
  return v.id;
}

export const minhasConversas = acao(async () => {
  const vendedorId = await meuVendedor();
  const linhas = await sql<ConversaDaLista[]>`
    select c.id, c.telefone, c.nome_contato, c.codcli, c.ultima_mensagem, c.ultima_em,
           c.ultima_de_mim, c.nao_lidas,
           (select coalesce(case when x.fantasia ~ '[A-Za-z]' then trim(x.fantasia) end, trim(x.cliente))
              from system.pcclient x where x.codcli = c.codcli) as cliente
      from conversas c
     where c.vendedor_id = ${vendedorId}
     order by c.ultima_em desc nulls last
     limit 300`;
  return [...linhas];
});

/**
 * 50 mensagens por vez, das mais novas para trás. `antes` é o cursor da página anterior
 * ("<iso>|<id>"): pelo índice (conversa, horário), nunca offset.
 */
export const mensagensDaConversa = acao(async (conversaId: string, antes: string | null) => {
  const c = await conversaVisivel(conversaId);
  const [quando, id] = antes ? antes.split("|") : [];
  const cursor = antes
    ? sql`and (m.enviada_em, m.id) < (${z.string().datetime().parse(quando)}::timestamptz, ${z.coerce.number().int().parse(id)})`
    : sql``;
  const linhas = await sql<(MensagemDaConversa & { id: number })[]>`
    select m.id, m.de_mim as "deMim", m.tipo, m.texto, m.enviada_em as "enviadaEm",
           d.doc ->> 'fileName' as "nomeArquivo",
           (d.doc ->> 'fileLength')::float8 as "tamanhoArquivo",
           (d.doc ->> 'pageCount')::int as paginas,
           case when q.id is not null
                then json_build_object('deMim', q.de_mim, 'tipo', q.tipo, 'texto', q.texto) end as citada
      from mensagens m
      -- O documento com legenda vem um nível abaixo.
      cross join lateral (select case when m.tipo = 'documento' then coalesce(
             m.bruto #> '{msgContent,documentMessage}',
             m.bruto #> '{msgContent,documentWithCaptionMessage,message,documentMessage}') end as doc) d
      left join mensagens q on q.conversa_id = m.conversa_id and q.wa_id = m.responde_a
     where m.conversa_id = ${c.id} ${cursor}
     order by m.enviada_em desc, m.id desc
     limit ${POR_LOTE + 1}`;
  const lote = linhas.slice(0, POR_LOTE).reverse();
  const maisAntiga = lote[0];
  return {
    mensagens: lote,
    antes:
      linhas.length > POR_LOTE && maisAntiga ? `${maisAntiga.enviadaEm}|${maisAntiga.id}` : null,
  };
});

export const marcarLida = acao(async (conversaId: string) => {
  const c = await conversaVisivel(conversaId);
  if (c.dono) await sql`update conversas set nao_lidas = 0 where id = ${c.id} and nao_lidas > 0`;
  return { ok: true as const };
});

/**
 * Resposta do vendedor pelo CRM: sai pela W-API do número dele e já entra no histórico.
 * `respondeA` é o id (no CRM) da mensagem citada, quando ele usa o "Responder".
 */
export const enviarMensagem = acao(
  async (conversaId: string, entrada: string, respondeA: number | null = null) => {
    const c = await conversaVisivel(conversaId);
    if (!c.dono) throw new Recusa("Só o vendedor da conversa responde por ela.");
    const texto = z.string().trim().min(1, "Escreva a mensagem.").max(4000).parse(entrada);
    const numero = await numeroDoVendedor(c.vendedorId);
    if (!numero) throw new Recusa("Seu WhatsApp ainda não está conectado ao CRM.");
    const [conversa] = await sql<
      { telefone: string }[]
    >`select telefone from conversas where id = ${c.id}`;
    const [citada] = respondeA
      ? await sql<{ wa_id: string }[]>`
          select wa_id from mensagens
           where id = ${z.number().int().positive().parse(respondeA)} and conversa_id = ${c.id}`
      : [];

    // Conversa que ainda só tem o LID vai para o LID; com o 55 na frente ele vira outro contato.
    const destino = conversa!.telefone;
    const resposta = await chamarWapi(numero, "POST", "/message/send-text", {
      phone: /^\d{10,11}$/.test(destino) ? `55${destino}` : destino,
      message: texto,
      ...(citada ? { messageId: citada.wa_id } : {}),
      // O cliente vê "digitando…" antes de a mensagem chegar: 1 s a cada ~40 letras, até 4 s.
      // A W-API não tem como mostrar enquanto o vendedor digita; a chamada volta na hora.
      delayMessage: Math.min(4, Math.max(1, Math.round(texto.length / 40))),
    });
    // O webhook devolve a mesma mensagem como fromMe com este id: o índice único segura.
    const waId = String(resposta["messageId"] ?? resposta["insertedId"] ?? crypto.randomUUID());
    const agora = new Date().toISOString();
    await sql.begin(async (tx) => {
      await tx`
      insert into mensagens (conversa_id, wa_id, de_mim, tipo, texto, enviada_em, responde_a, bruto)
      values (${c.id}, ${waId}, true, 'texto', ${texto}, ${agora}, ${citada?.wa_id ?? null},
              ${tx.json(resposta as JSONValue)})
      on conflict (conversa_id, wa_id) do nothing`;
      await tx`
      update conversas set ultima_mensagem = ${resumoMensagem({ tipo: "texto", texto })},
             ultima_em = ${agora}, ultima_de_mim = true, nao_lidas = 0
       where id = ${c.id}`;
    });
    return { ok: true as const };
  },
);

export type ClienteParaConversa = {
  codcli: number;
  nome: string;
  cnpj: string | null;
  cidade: string | null;
  naCarteira: boolean;
};

/**
 * Clientes ativos do Winthor para ligar à conversa: quem escreve pode não ser da carteira
 * do vendedor. Os da carteira vêm primeiro.
 */
export const clientesParaConversa = acao(async (termo: string) => {
  const vendedorId = await meuVendedor();
  if (termo.trim().length < 2) return [];
  // CNPJ só com dígitos: acha com ou sem a pontuação digitada.
  const busca = condicaoBusca(termo, [
    sql`c.cliente`,
    sql`c.fantasia`,
    sql`c.codcli::text`,
    sql`regexp_replace(c.cgcent, '[^0-9]', '', 'g')`,
  ]);
  // A carteira sai uma vez e entra por join: um exists por cliente achado levava ~0,6 s.
  const linhas = await sql<ClienteParaConversa[]>`
    with minha as (
      select distinct k.codcli from vendedores v join ${carteiraWinthor()} k on k.codusur = v.codusur
       where v.id = ${vendedorId})
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

/**
 * O vendedor diz de que cliente é a conversa (qualquer cliente ativo; quem escreve pode
 * não ser da carteira). O celular vai para os contatos do cliente: da próxima vez esse
 * número já chega identificado.
 */
export const identificarCliente = acao(async (conversaId: string, entrada: number | null) => {
  const c = await conversaVisivel(conversaId);
  if (!c.dono) throw new Recusa("Só o vendedor da conversa identifica o cliente.");
  // null tira o cliente da conversa ("Remover cliente").
  const codcli = entrada === null ? null : z.number().int().positive().parse(entrada);
  if (codcli) {
    const [ativo] = await sql<{ ok: boolean }[]>`
      select exists (select 1 from system.pcclient
                      where codcli = ${codcli} and dtexclusao is null) as ok`;
    if (!ativo?.ok) throw new Recusa("Cliente não encontrado ou inativo no Winthor.");
  }
  await sql.begin(async (tx) => {
    const [antes] = await tx<
      { codcli: number | null; telefone: string; nome_contato: string | null }[]
    >`select codcli, telefone, nome_contato from conversas where id = ${c.id} for update`;
    if (!antes) throw new Recusa("Conversa não encontrada.");
    // O número sai dos contatos do cliente anterior: senão a próxima conversa desse número
    // chegaria identificada com ele de novo. Os contatos do Winthor são só leitura.
    if (antes.codcli && antes.codcli !== codcli)
      await tx`
        delete from cliente_contatos
         where codcli = ${antes.codcli}
           and crm.chave_telefone(celular) = crm.chave_telefone(${antes.telefone})`;
    await tx`update conversas set codcli = ${codcli} where id = ${c.id}`;
    if (codcli && /^[0-9]{10,11}$/.test(antes.telefone))
      await tx`
        insert into cliente_contatos (codcli, nome, celular)
        values (${codcli}, ${antes.nome_contato?.trim() || "Contato do WhatsApp"}, ${antes.telefone})
        on conflict (codcli, celular) do nothing`;
  });
  return { ok: true as const };
});
