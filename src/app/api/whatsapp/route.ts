import { timingSafeEqual } from "node:crypto";

import { after, type NextRequest } from "next/server";

import { arquivoDaMensagem, lerConexao, lerWebhook } from "@/lib/whatsapp";
import {
  baixarMidia,
  guardarMensagem,
  marcarConexao,
  vendedorDaInstancia,
} from "@/server/whatsapp";

/** A URL é pública: só a W-API, que conhece a chave do .env, consegue gravar mensagem. */
function chaveConfere(chave: string | null) {
  const esperada = process.env["WAPI_WEBHOOK_CHAVE"];
  if (!esperada || !chave) return false;
  const a = Buffer.from(chave);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Webhook da W-API (mensagem recebida, enviada pelo celular, conexão e desconexão):
 * POST /api/whatsapp?chave=<WAPI_WEBHOOK_CHAVE>. Grupo, evento sem mensagem e número que
 * não é de nenhum vendedor respondem 200 sem gravar nada, para a W-API não repetir.
 */
export async function POST(request: NextRequest) {
  if (!chaveConfere(request.nextUrl.searchParams.get("chave")))
    return new Response(null, { status: 401 });

  const corpo: unknown = await request.json().catch(() => null);
  const conexao = lerConexao(corpo);
  if (conexao) {
    console.info(`WhatsApp ${conexao.instancia} ${conexao.conectado ? "conectou" : "desconectou"}`);
    await marcarConexao({ instancia: conexao.instancia }, conexao.conectado);
    return Response.json({ ok: true });
  }
  const mensagem = lerWebhook(corpo);
  if (!mensagem) return Response.json({ ok: true, ignorada: "não é mensagem de conversa" });

  const vendedorId = await vendedorDaInstancia(mensagem.instancia);
  if (!vendedorId) return Response.json({ ok: true, ignorada: "instância sem vendedor" });

  // Mensagem chegando é prova de conexão: apaga o aviso mesmo se o "conectou" se perdeu.
  after(() => marcarConexao({ vendedorId }, true));
  const id = await guardarMensagem(vendedorId, mensagem, corpo);
  // O arquivo vem depois de responder: a W-API não espera o download. Se falhar,
  // /midias/<id> tenta de novo quando alguém abrir.
  if (id && arquivoDaMensagem(corpo))
    after(() => baixarMidia(id).catch((e) => console.error(`Mídia da mensagem ${id}:`, e)));
  return Response.json({ ok: true });
}
