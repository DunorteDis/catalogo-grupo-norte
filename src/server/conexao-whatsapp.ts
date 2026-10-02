"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { numeroNacional } from "@/lib/catalogo";
import { acao, Recusa } from "@/server/acao";
import { sql } from "@/server/db";
import { exigirAdmin, exigirLogin } from "@/server/sessao";
import {
  apontarWebhooks,
  chamarWapi,
  marcarConexao,
  numeroDoVendedor,
  type NumeroWhatsapp,
} from "@/server/whatsapp";

export type AvisoWhatsapp = {
  /** O número do próprio vendedor caiu. */
  meu: boolean;
  /** Para o admin: vendedores da distribuidora com o número caído. */
  desconectados: { nome: string; desde: string | null }[];
};

/** Para a faixa de aviso no topo: lê do banco, sem chamar a W-API (é consultado a cada minuto). */
export const avisoWhatsapp = acao(async (): Promise<AvisoWhatsapp> => {
  const s = await exigirLogin();
  if (s.papel === "vendedor") {
    const [n] = await sql<{ conectado: boolean | null }[]>`
      select n.conectado from whatsapp_numeros n join vendedores v on v.id = n.vendedor_id
       where v.user_id = ${s.sub}`;
    return { meu: n?.conectado === false, desconectados: [] };
  }
  if (!s.dist) return { meu: false, desconectados: [] };
  const desconectados = await sql<{ nome: string; desde: string | null }[]>`
    select v.nome, n.conexao_em as desde from whatsapp_numeros n join vendedores v on v.id = n.vendedor_id
     where v.distribuidora_id = ${s.dist} and n.conectado = false
     order by v.nome`;
  return { meu: false, desconectados: [...desconectados] };
});

export type EstadoWhatsapp =
  | { cadastrado: false }
  | {
      cadastrado: true;
      instancia: string;
      conectado: boolean;
      /** Número que leu o QR code (DDD + número), quando conectado. */
      telefone: string | null;
      erro: string | null;
    };

/** null é o próprio vendedor logado; um id é o admin mexendo num vendedor da distribuidora dele. */
async function vendedorAlvo(vendedorId: string | null) {
  if (vendedorId === null) {
    const s = await exigirLogin();
    const [v] = await sql<{ id: string }[]>`select id from vendedores where user_id = ${s.sub}`;
    if (!v) throw new Recusa("Seu acesso não tem cadastro de vendedor.");
    return v.id;
  }
  const s = await exigirAdmin();
  const id = z.string().uuid().parse(vendedorId);
  const [v] = await sql<{ id: string }[]>`
    select id from vendedores where id = ${id} and distribuidora_id = ${s.dist}`;
  if (!v) throw new Recusa("Vendedor não encontrado.");
  return v.id;
}

/** Só lê o estado: pode ser consultado a cada poucos segundos sem mexer no pareamento. */
export const estadoWhatsapp = acao(async (vendedorId: string | null): Promise<EstadoWhatsapp> => {
  const id = await vendedorAlvo(vendedorId);
  const numero = await numeroDoVendedor(id);
  if (!numero) return { cadastrado: false };
  const base = { cadastrado: true as const, instancia: numero.instancia };
  try {
    const s = await chamarWapi(numero, "GET", "/instance/status-instance");
    // A consulta também mantém o aviso certo, caso o webhook de conexão tenha se perdido.
    await marcarConexao({ vendedorId: id }, s["connected"] === true);
    if (s["connected"] !== true) return { ...base, conectado: false, telefone: null, erro: null };
    const i = await chamarWapi(numero, "GET", "/instance/fetch-instance");
    const fone = i["connectedPhone"];
    return {
      ...base,
      conectado: true,
      telefone: typeof fone === "string" ? numeroNacional(fone) : null,
      erro: null,
    };
  } catch (e) {
    return { ...base, conectado: false, telefone: null, erro: (e as Error).message };
  }
});

/**
 * Cada chamada gera um QR code novo e derruba o pareamento que estiver em andamento
 * (visto na W-API: códigos diferentes a 4 s de intervalo). Só chamar quando a pessoa pedir.
 */
export const qrCodeWhatsapp = acao(async (vendedorId: string | null) => {
  const numero = await numeroDoVendedor(await vendedorAlvo(vendedorId));
  if (!numero) throw new Recusa("Nenhum número cadastrado.");
  // Pedir QR com o número conectado pode derrubar a sessão. A tela pede quando acha que
  // está desconectado, e uma consulta que falhou já faz parecer: confere de novo aqui.
  const situacao = await chamarWapi(numero, "GET", "/instance/status-instance").catch(() => null);
  if (!situacao) throw new Recusa("Não foi possível conferir a conexão na W-API. Tente de novo.");
  if (situacao["connected"] === true) throw new Recusa("O WhatsApp já está conectado.");
  const qrcode = (await chamarWapi(numero, "GET", "/instance/qr-code"))["qrcode"];
  if (typeof qrcode !== "string" || !qrcode.startsWith("data:image/"))
    throw new Recusa("A W-API não devolveu o QR code. Tente de novo.");
  return qrcode;
});

/** Endereço do CRM para a W-API chamar: APP_URL ou o endereço por onde o admin está usando. */
async function origemPublica() {
  const fixa = process.env["APP_URL"];
  if (fixa) return fixa.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = (h.get("x-forwarded-proto") ?? "http").split(",")[0]!.trim();
  return `${proto}://${host}`;
}

/** Aponta o webhook de mensagens da instância para o CRM. Volta o aviso, se não deu. */
async function apontarWebhook(numero: NumeroWhatsapp) {
  const chave = process.env["WAPI_WEBHOOK_CHAVE"];
  if (!chave) return "Falta WAPI_WEBHOOK_CHAVE no .env do servidor: as mensagens não vão chegar.";
  const origem = await origemPublica();
  const { protocol, hostname } = new URL(origem);
  if (
    protocol !== "https:" ||
    /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)
  )
    return `O CRM está em ${origem}, que a W-API não alcança pela internet. O número conecta, mas as mensagens só chegam com o CRM num endereço público em HTTPS (APP_URL no .env). Depois é só salvar aqui de novo.`;
  try {
    await apontarWebhooks(numero, `${origem}/api/whatsapp?chave=${chave}`);
    return null;
  } catch (e) {
    return `A W-API não aceitou o endereço de recebimento: ${(e as Error).message}`;
  }
}

const Instancia = z.object({
  instancia: z.string().trim().min(5, "Informe o ID da instância.").max(100),
  token: z.string().trim().min(10, "Informe o token da instância.").max(500),
});

/**
 * O admin liga o número do vendedor: confere ID e token na W-API, guarda e aponta o
 * webhook para o CRM. Ler o QR code fica com quem está com o celular.
 */
export const conectarWhatsapp = acao(
  async (vendedorId: string, entrada: z.input<typeof Instancia>) => {
    const id = await vendedorAlvo(z.string().parse(vendedorId));
    const numero = Instancia.parse(entrada);
    const [outro] = await sql`
      select 1 from whatsapp_numeros where instancia = ${numero.instancia} and vendedor_id <> ${id}`;
    if (outro) throw new Recusa("Essa instância já está ligada a outro vendedor.");
    await chamarWapi(numero, "GET", "/instance/fetch-instance").catch(() => {
      throw new Recusa("A W-API não reconheceu esse ID com esse token. Confira os dois no painel.");
    });
    await sql`
      insert into whatsapp_numeros (vendedor_id, instancia, token)
      values (${id}, ${numero.instancia}, ${numero.token})
      on conflict (vendedor_id) do update set instancia = excluded.instancia, token = excluded.token`;
    return { aviso: await apontarWebhook(numero) };
  },
);

/** Logout do WhatsApp na instância: para voltar, lê o QR code de novo. */
export const desconectarWhatsapp = acao(async (vendedorId: string | null) => {
  const numero = await numeroDoVendedor(await vendedorAlvo(vendedorId));
  if (!numero) throw new Recusa("Nenhum número cadastrado.");
  await chamarWapi(numero, "GET", "/instance/disconnect");
  return { ok: true as const };
});
