import { fotoVence } from "@/lib/whatsapp";
import { sql } from "@/server/db";
import { conversaVisivel, fotoDoContato } from "@/server/whatsapp";

const HORA = 60 * 60 * 1000;
/** Contato sem foto: só pergunta de novo à W-API depois disso. */
const RECONFERIR = 24 * HORA;

const semFoto = () =>
  new Response(null, { status: 404, headers: { "Cache-Control": "private, max-age=3600" } });

/**
 * Foto de perfil do contato da conversa, para o avatar. O link do WhatsApp vence em uns
 * 10 dias: vencido, pede outro à W-API. Sem foto, 404 e a tela fica com as iniciais.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await conversaVisivel(id).catch(() => null);
  if (!c) return semFoto();
  const [conversa] = await sql<
    { telefone: string; foto_url: string | null; foto_em: string | null }[]
  >`select telefone, foto_url, foto_em from conversas where id = ${c.id}`;
  if (!conversa) return semFoto();

  let url = conversa.foto_url;
  let vence = url ? fotoVence(url) : null;
  if (!url || !vence || vence < Date.now() + HORA) {
    const conferida = conversa.foto_em && Date.parse(conversa.foto_em) > Date.now() - RECONFERIR;
    if (conferida && !url) return semFoto();
    url = await fotoDoContato(c.vendedorId, conversa.telefone);
    vence = url ? fotoVence(url) : null;
    await sql`update conversas set foto_url = ${url}, foto_em = now() where id = ${c.id}`;
  }
  if (!url) return semFoto();
  // O navegador guarda o redirecionamento até perto do link vencer (no máximo 1 dia).
  const segundos = Math.max(60, Math.min(24 * 3600, ((vence ?? 0) - Date.now() - HORA) / 1000));
  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": `private, max-age=${Math.floor(segundos)}` },
  });
}
