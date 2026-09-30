import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { EXTENSAO_FOTO } from "@/lib/catalogo";

/**
 * Fotos de produto num bucket privado. Nada aqui é público: o objeto só sai por
 * URL assinada de vida curta, gerada em /fotos/<chave>.
 *
 * ponytail: sem config — o SDK lê AWS_REGION, AWS_ACCESS_KEY_ID e
 * AWS_SECRET_ACCESS_KEY do ambiente, como o postgres.js faz com PG*.
 */
let cliente: S3Client | undefined;
const s3 = () => (cliente ??= new S3Client({}));

const PASTA = "produtos/";

function bucket() {
  const nome = process.env["S3_BUCKET"];
  if (!nome) throw new Error("S3_BUCKET não está definido no .env.");
  return nome;
}

/** Sobe a foto e devolve o valor que vai para produtos.arquivo. */
// ponytail: foto trocada ou de produto excluído fica no bucket; uma regra de ciclo de vida limpa se pesar.
export async function guardarFoto(arquivo: File) {
  const chave = `${crypto.randomUUID()}.${EXTENSAO_FOTO[arquivo.type]}`;
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: PASTA + chave,
      Body: Buffer.from(await arquivo.arrayBuffer()),
      ContentType: arquivo.type,
      // Nome novo a cada envio: a mesma chave nunca muda de conteúdo.
      CacheControl: "private, max-age=31536000, immutable",
    }),
  );
  return `/fotos/${chave}`;
}

export function assinarFoto(chave: string, segundos: number) {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: PASTA + chave }), {
    expiresIn: segundos,
  });
}
