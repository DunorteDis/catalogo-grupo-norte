import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@/styles.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Catálogo de Pedidos",
  description: "Catálogo de produtos com pedido pelo WhatsApp.",
  openGraph: { type: "website" },
  twitter: { card: "summary_large_image" },
  // Símbolo do Abastex (o X de quatro barras), como pede o DS para favicon.
  icons: {
    icon: [{ url: "/abastex-symbol.png", type: "image/png", sizes: "108x108" }],
    apple: "/abastex-symbol.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
