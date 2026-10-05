import type { JSONValue, TransactionSql } from "postgres";
import { z } from "zod";

import {
  arquivoDaMensagem,
  codigoNaMensagem,
  resumoMensagem,
  type MensagemWhatsapp,
} from "@/lib/whatsapp";
import { Recusa } from "@/server/acao";
import type { Papel } from "@/lib/sessao-token";
import { carteiraWinthor, sql } from "@/server/db";
import { guardarArquivoWhatsapp } from "@/server/s3";
import { exigirLogin } from "@/server/sessao";

// Sem "use server": nada daqui pode virar action chamável pelo navegador.

const BASE = "https://api.w-api.app/v1";

/**
 * Conversas pelo WhatsApp ainda em desenvolvimento. Só o TI e o vendedor piloto (com número
 * cadastrado na W-API) veem o módulo, o aviso de desconexão, a conexão em Usuários e a
 * conversa dentro do pedido. Catálogo, pedidos e carteira funcionam sem ele.
 * ponytail: liberar para todos é trocar para true.
 */
export const CONVERSAS_LIBERADAS = false;

export async function veConversas(userId: string, papel: Papel) {
  if (CONVERSAS_LIBERADAS || papel === "ti") return true;
  if (papel !== "vendedor") return false;
  const [n] = await sql<{ ok: boolean }[]>`
    select exists (select 1 from whatsapp_numeros n join vendedores v on v.id = n.vendedor_id
                    where v.user_id = ${userId}) as ok`;
  return !!n?.ok;
}

export type NumeroWhatsapp = { instancia: string; token: string };

/** Chamada à W-API da instância (o número) de um vendedor. */
export async function chamarWapi(
  numero: NumeroWhatsapp,
  metodo: "GET" | "POST" | "PUT",
  caminho: string,
  corpo?: unknown,
  ms = 15_000,
): Promise<Record<string, unknown>> {
  const resposta = await fetch(
    `${BASE}${caminho}${caminho.includes("?") ? "&" : "?"}instanceId=${encodeURIComponent(numero.instancia)}`,
    {
      method: metodo,
      headers: { Authorization: `Bearer ${numero.token}`, "Content-Type": "application/json" },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
      signal: AbortSignal.timeout(ms),
    },
  );
  const dados = (await resposta.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resposta.ok || dados["error"])
    throw new Error(
      String(dados["message"] ?? dados["error"] ?? `W-API respondeu ${resposta.status}`),
    );
  return dados;
}

/**
 * Aponta para o CRM os webhooks da instância: mensagens recebidas, enviadas pelo próprio
 * celular (sem este, a resposta dada fora do CRM não entra no histórico) e os avisos de
 * conexão e desconexão (para alertar na hora quando o número cair).
 */
export async function apontarWebhooks(numero: NumeroWhatsapp, url: string) {
  for (const caminho of [
    "/webhook/update-webhook-received",
    "/webhook/update-webhook-delivery",
    "/webhook/update-webhook-connected",
    "/webhook/update-webhook-disconnected",
  ])
    // { value }: com o { url, enabled } da documentação a W-API responde "atualizado" e não grava.
    await chamarWapi(numero, "PUT", caminho, { value: url });
}

/** Guarda se o número está conectado; só escreve quando muda. */
export async function marcarConexao(
  alvo: { instancia: string } | { vendedorId: string },
  conectado: boolean,
) {
  const onde =
    "instancia" in alvo
      ? sql`instancia = ${alvo.instancia}`
      : sql`vendedor_id = ${alvo.vendedorId}`;
  await sql`
    update whatsapp_numeros set conectado = ${conectado}, conexao_em = now()
     where ${onde} and conectado is distinct from ${conectado}`;
}

export async function numeroDoVendedor(vendedorId: string) {
  const [n] = await sql<NumeroWhatsapp[]>`
    select instancia, token from whatsapp_numeros where vendedor_id = ${vendedorId}`;
  return n ?? null;
}

/** Link novo da foto de perfil do contato; null quando ele não tem ou não mostra. */
export async function fotoDoContato(vendedorId: string, telefone: string) {
  if (!/^\d{10,11}$/.test(telefone)) return null;
  const numero = await numeroDoVendedor(vendedorId);
  if (!numero) return null;
  // phoneNumber, não o phone da documentação; sem foto a W-API responde erro.
  const r = await chamarWapi(
    numero,
    "GET",
    `/contacts/profile-picture?phoneNumber=55${telefone}`,
  ).catch(() => null);
  const link = r?.["link"];
  return typeof link === "string" && link.startsWith("https://") ? link : null;
}

export async function vendedorDaInstancia(instancia: string) {
  const [n] = await sql<{ vendedor_id: string }[]>`
    select vendedor_id from whatsapp_numeros where instancia = ${instancia}`;
  return n?.vendedor_id ?? null;
}

/**
 * Cliente de quem chama, pelo celular: contatos cadastrados aqui, contatos do ERP e o
 * telefone do cadastro. Um só, fica ele; vários, vale o único da carteira do vendedor;
 * ainda empatado, ninguém, e o vendedor escolhe na tela.
 */
export async function clientePeloTelefone(
  tx: TransactionSql,
  vendedorId: string,
  telefone: string,
) {
  const candidatos = await tx<{ codcli: number; na_carteira: boolean }[]>`
    with alvo as (select crm.chave_telefone(${telefone}) as chave),
    achados as (
      select x.codcli from cliente_contatos x, alvo where crm.chave_telefone(x.celular) = alvo.chave
      union
      select k.codcli from system.pccontato k, alvo
       where crm.chave_telefone(k.celular) = alvo.chave or crm.chave_telefone(k.telefone) = alvo.chave
      union
      select c.codcli from system.pcclient c, alvo
       where crm.chave_telefone(c.telent1) = alvo.chave or crm.chave_telefone(c.telent) = alvo.chave
    )
    select a.codcli,
           exists (select 1 from vendedores v join ${carteiraWinthor()} k on k.codusur = v.codusur
                    where v.id = ${vendedorId} and k.codcli = a.codcli) as na_carteira
      from achados a
      join system.pcclient c on c.codcli = a.codcli and c.dtexclusao is null`;
  if (candidatos.length === 1) return candidatos[0]!.codcli;
  const daCarteira = candidatos.filter((c) => c.na_carteira);
  return daCarteira.length === 1 ? daCarteira[0]!.codcli : null;
}

/**
 * Grava a mensagem na conversa do contato (cria a conversa e identifica o cliente na
 * primeira), atualiza a cópia da última mensagem e, se a mensagem traz o código de um
 * pedido do catálogo, liga o pedido à conversa. Webhook repetido não duplica. Volta o id
 * da mensagem nova (null se ela já existia).
 */
export async function guardarMensagem(vendedorId: string, m: MensagemWhatsapp, bruto: unknown) {
  // Sem telefone (enviada pelo celular para contato que só veio como LID), o LID segura
  // o lugar até uma mensagem recebida trazer o número.
  const chave = m.telefone ?? m.lid!;
  return sql.begin(async (tx) => {
    type Conversa = { id: string; telefone: string; lid: string | null; codcli: number | null };
    let [conversa] = await tx<Conversa[]>`
      select id, telefone, lid, codcli from conversas
       where vendedor_id = ${vendedorId}
         and (telefone = ${chave} or lid = ${m.lid} or telefone = ${m.lid})
       order by telefone = ${chave} desc
       limit 1`;
    if (!conversa) {
      const codcli = m.telefone ? await clientePeloTelefone(tx, vendedorId, m.telefone) : null;
      [conversa] = await tx<Conversa[]>`
        insert into conversas (vendedor_id, telefone, lid, nome_contato, codcli)
        values (${vendedorId}, ${chave}, ${m.lid}, ${m.nome}, ${codcli})
        on conflict (vendedor_id, telefone) do update set telefone = excluded.telefone
        returning id, telefone, lid, codcli`;
    } else if ((m.telefone && conversa.telefone !== m.telefone) || (m.lid && !conversa.lid)) {
      // Conversa que começou só com o LID ganha o telefone (e o cliente) quando ele aparece.
      const telefone = m.telefone && conversa.telefone !== m.telefone ? m.telefone : null;
      const codcli =
        telefone && !conversa.codcli ? await clientePeloTelefone(tx, vendedorId, telefone) : null;
      await tx`
        update conversas set telefone = coalesce(${telefone}, telefone),
               lid = coalesce(lid, ${m.lid}), codcli = coalesce(codcli, ${codcli})
         where id = ${conversa.id}`;
    }
    const conversaId = conversa!.id;

    const [nova] = await tx<{ id: number }[]>`
      insert into mensagens (conversa_id, wa_id, de_mim, tipo, texto, enviada_em, responde_a, bruto)
      values (${conversaId}, ${m.waId}, ${m.deMim}, ${m.tipo}, ${m.texto}, ${m.enviadaEm},
              ${m.respondeA}, ${tx.json(bruto as JSONValue)})
      on conflict (conversa_id, wa_id) do nothing
      returning id`;
    if (!nova) return null;

    // A cópia só anda para a frente: webhook atrasado não troca a última mensagem.
    await tx`
      update conversas set
        ultima_mensagem = case when ultima_em is null or ${m.enviadaEm} >= ultima_em
                               then ${resumoMensagem(m)} else ultima_mensagem end,
        ultima_de_mim = case when ultima_em is null or ${m.enviadaEm} >= ultima_em
                             then ${m.deMim} else ultima_de_mim end,
        ultima_em = greatest(ultima_em, ${m.enviadaEm}),
        nao_lidas = case when ${m.deMim} then 0 else nao_lidas + 1 end,
        nome_contato = coalesce(${m.nome}, nome_contato),
        -- Cada mensagem traz o link da foto renovado: vale mais que o guardado.
        foto_url = coalesce(${m.foto}, foto_url),
        foto_em = case when ${m.foto}::text is not null then now() else foto_em end
      where id = ${conversaId}`;

    // O pedido ganha também o cliente da conversa, se não veio com um pelo link.
    const codigo = m.deMim ? null : codigoNaMensagem(m.texto);
    if (codigo)
      await tx`
        update pedidos set conversa_id = ${conversaId},
               codcli = coalesce(codcli, (select codcli from conversas where id = ${conversaId}))
         where vendedor_id = ${vendedorId} and conversa_id is null
           and created_at > now() - interval '7 days'
           and replace(id::text, '-', '') like ${`${codigo.toLowerCase()}%`}`;
    return nova.id;
  });
}

/**
 * O vendedor vê e responde só as conversas dele; o admin vê (sem responder) as dos
 * vendedores da distribuidora em uso — é o histórico que aparece no pedido.
 */
export async function conversaVisivel(conversaId: string) {
  const s = await exigirLogin();
  const id = z.string().uuid().parse(conversaId);
  const [c] = await sql<
    { vendedor_id: string; user_id: string | null; distribuidora_id: string }[]
  >`
    select c.vendedor_id, v.user_id, v.distribuidora_id
      from conversas c join vendedores v on v.id = c.vendedor_id
     where c.id = ${id}`;
  if (!c) throw new Recusa("Conversa não encontrada.");
  const dono = c.user_id === s.sub;
  if (!dono && (s.papel === "vendedor" || c.distribuidora_id !== s.dist))
    throw new Recusa("Essa conversa não é sua.");
  return { id, vendedorId: c.vendedor_id, dono };
}

/** Acima disso o arquivo fica só no celular: ele passa inteiro pela memória até o S3. */
const LIMITE_MIDIA = 25 * 1024 * 1024;

const EXTENSOES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "application/pdf": "pdf",
};

/**
 * Traz o arquivo da mensagem da W-API para o S3 (uma vez só) e devolve a chave e o nome
 * do documento. null quando a mensagem não tem arquivo ou ele é grande demais.
 */
export async function baixarMidia(mensagemId: number) {
  const [m] = await sql<
    { midia: string | null; bruto: unknown; conversa_id: string; vendedor_id: string }[]
  >`
    select m.midia, m.bruto, m.conversa_id, c.vendedor_id
      from mensagens m join conversas c on c.id = m.conversa_id
     where m.id = ${mensagemId}`;
  const arquivo = m && arquivoDaMensagem(m.bruto);
  if (!m || !arquivo) return null;
  if (m.midia) return { chave: m.midia, nome: arquivo.nome };
  if ((arquivo.tamanho ?? 0) > LIMITE_MIDIA) return null;
  const numero = await numeroDoVendedor(m.vendedor_id);
  if (!numero) return null;

  const { type, mediaKey, directPath, mimetype, nome } = arquivo;
  const resposta = await chamarWapi(
    numero,
    "POST",
    "/message/download-media",
    { type, mediaKey, directPath, mimetype },
    90_000,
  );
  // Vem { fileLink, expires }: um link temporário, não o { base64, mimetype } da documentação.
  const link = resposta["fileLink"];
  if (typeof link !== "string")
    throw new Error(`download-media sem fileLink: ${Object.keys(resposta).join(", ")}`);
  const f = await fetch(link, { signal: AbortSignal.timeout(60_000) });
  if (!f.ok) throw new Error(`O link do arquivo respondeu ${f.status}`);
  const corpo = Buffer.from(await f.arrayBuffer());
  const tipo = mimetype;
  const base = tipo.split(";")[0]!.trim();
  const extensao = EXTENSOES[base] ?? nome?.match(/\.([a-z0-9]{1,8})$/i)?.[1] ?? "bin";
  const chave = `${m.conversa_id}/${mensagemId}.${extensao}`;
  await guardarArquivoWhatsapp(chave, corpo, tipo);
  await sql`update mensagens set midia = ${chave}, midia_tipo = ${tipo} where id = ${mensagemId}`;
  return { chave, nome };
}
