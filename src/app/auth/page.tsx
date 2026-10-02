import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { destinoDoAcesso } from "@/lib/sessao-token";
import { acessoDe, lerSessao } from "@/server/sessao";
import { FormLogin } from "./form-login";

export const metadata: Metadata = {
  title: "Entrar — Abastex Connect",
  description: "Acesso ao Abastex Connect, o CRM de vendas pelo WhatsApp do Grupo Norte.",
  openGraph: {
    title: "Entrar — Abastex Connect",
    description: "Acesso ao Abastex Connect, o CRM de vendas pelo WhatsApp do Grupo Norte.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: false },
};

export default async function AuthPage() {
  // Quem tem sessão que ainda vale vai direto para a própria área. Sessão que não
  // vale mais (conta apagada, distribuidora desligada) fica no formulário: o layout
  // manda para cá pela mesma regra, então não há ciclo.
  const s = await lerSessao();
  if (s) {
    const destino = destinoDoAcesso(await acessoDe(s.sub, s.dist), s.prov);
    if (destino) redirect(destino);
  }
  return <FormLogin />;
}
