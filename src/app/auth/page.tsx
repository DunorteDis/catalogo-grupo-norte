import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { lerSessao } from "@/server/sessao";
import { FormLogin } from "./form-login";

export const metadata: Metadata = {
  title: "Entrar — Grupo Norte Distribuição",
  description: "Acesso à plataforma de catálogo do Grupo Norte.",
  openGraph: {
    title: "Entrar — Grupo Norte Distribuição",
    description: "Acesso à plataforma de catálogo do Grupo Norte.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: false },
};

export default async function AuthPage() {
  // Quem já tem sessão vai direto para a própria área.
  const s = await lerSessao();
  if (s) redirect(s.prov ? "/definir-senha" : s.admin ? "/admin" : "/vendedor");
  return <FormLogin />;
}
