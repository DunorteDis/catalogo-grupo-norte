import { sql } from "@/server/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Público como era o bucket: a imagem aparece para o cliente sem login.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response(null, { status: 404 });
  const [img] = await sql<{ tipo: string; dados: Buffer }[]>`
    select tipo, dados from imagens where id = ${id}`;
  if (!img) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(img.dados), {
    headers: {
      "Content-Type": img.tipo,
      // Nome novo a cada envio: a mesma URL nunca muda de conteúdo.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
