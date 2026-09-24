import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { usuarioDeEmail } from "@/lib/acessos";
import { lerSessao } from "@/server/sessao";
import { FormSenha } from "./form-senha";

export const metadata: Metadata = {
  title: "Definir senha — Abastex",
  robots: { index: false },
};

export default async function DefinirSenhaPage() {
  const s = await lerSessao();
  if (!s) redirect("/auth");
  // Quem já trocou não volta para cá.
  if (!s.prov) redirect(s.admin ? "/admin" : "/vendedor");
  return <FormSenha usuario={usuarioDeEmail(s.email)} />;
}
