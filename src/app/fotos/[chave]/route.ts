import { CHAVE_FOTO } from "@/lib/catalogo";
import { assinarFoto } from "@/server/s3";

const VALIDADE = 60 * 60;

// Sem login, como /imagens: o cliente vê a foto no catálogo público. O bucket
// continua privado — quem abre /fotos/<chave> recebe uma URL assinada que expira.
export async function GET(_req: Request, { params }: { params: Promise<{ chave: string }> }) {
  const { chave } = await params;
  if (!CHAVE_FOTO.test(chave)) return new Response(null, { status: 404 });
  return new Response(null, {
    status: 302,
    headers: {
      Location: await assinarFoto(chave, VALIDADE),
      // Guarda o redirecionamento um pouco menos que a assinatura: a lista de
      // produtos não pede uma URL nova a cada render, e a guardada nunca vence.
      "Cache-Control": `private, max-age=${VALIDADE - 10 * 60}`,
    },
  });
}
