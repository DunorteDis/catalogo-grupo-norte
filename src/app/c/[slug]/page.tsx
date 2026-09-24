import type { Metadata } from "next";

import { EscolherCatalogo } from "./escolher-catalogo";

export const metadata: Metadata = {
  title: "Escolha o catálogo — faça seu pedido",
  description: "Escolha o catálogo para ver os produtos e montar seu pedido pelo WhatsApp.",
  openGraph: {
    title: "Escolha o catálogo — faça seu pedido",
    description: "Escolha o catálogo para ver os produtos e montar seu pedido.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function Page() {
  return <EscolherCatalogo />;
}
