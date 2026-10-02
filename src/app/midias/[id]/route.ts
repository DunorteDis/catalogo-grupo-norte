import { Recusa } from "@/server/acao";
import { sql } from "@/server/db";
import { assinarArquivoWhatsapp, lerArquivoWhatsapp } from "@/server/s3";
import { baixarMidia, conversaVisivel } from "@/server/whatsapp";

const VALIDADE = 60 * 60;

/**
 * Arquivo de uma mensagem do WhatsApp (foto, áudio, vídeo, documento), só para quem vê a
 * conversa. O bucket é privado: sai uma URL assinada que expira. O que o webhook não
 * conseguiu baixar na hora é baixado aqui, na primeira vez que alguém abre.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,15}$/.test(id)) return new Response(null, { status: 404 });
  const [m] = await sql<{ conversa_id: string }[]>`
    select conversa_id from mensagens where id = ${id}`;
  if (!m) return new Response(null, { status: 404 });
  try {
    await conversaVisivel(m.conversa_id);
  } catch (e) {
    if (e instanceof Recusa) return new Response(null, { status: 403 });
    throw e;
  }

  const arquivo = await baixarMidia(Number(id)).catch((e: unknown) => {
    console.error(`Mídia da mensagem ${id}:`, e);
    return null;
  });
  if (!arquivo) return new Response(null, { status: 404 });

  // ?baixar: o arquivo passa por aqui com o tamanho, para a tela mostrar o progresso como
  // o WhatsApp (pelo redirecionamento, o fetch esbarraria no CORS do bucket).
  if (new URL(req.url).searchParams.has("baixar")) {
    const a = await lerArquivoWhatsapp(arquivo.chave);
    return new Response(a.corpo, {
      headers: {
        "Content-Type": a.tipo,
        ...(a.tamanho ? { "Content-Length": String(a.tamanho) } : {}),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(arquivo.nome ?? `arquivo-${id}`)}`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: await assinarArquivoWhatsapp(arquivo.chave, VALIDADE, arquivo.nome),
      // Menos que a assinatura: a URL guardada pelo navegador nunca vence.
      "Cache-Control": `private, max-age=${VALIDADE - 10 * 60}`,
    },
  });
}
