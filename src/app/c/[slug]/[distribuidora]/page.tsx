import type { Metadata } from "next";

import { Catalogo } from "./catalogo";

export const metadata: Metadata = {
  title: "Catálogo de produtos — faça seu pedido",
  description:
    "Escolha os produtos e as quantidades desejadas e envie seu pedido direto para o vendedor pelo WhatsApp.",
  openGraph: {
    title: "Catálogo de produtos — faça seu pedido",
    description: "Monte sua lista de produtos e envie o pedido pelo WhatsApp.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

// ?c= é a chave do link do cliente (linkDoCatalogo): o pedido chega identificado.
export default async function Page({ searchParams }: PageProps<"/c/[slug]/[distribuidora]">) {
  const { c } = await searchParams;
  return <Catalogo chave={typeof c === "string" ? c : null} />;
}
