import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { areaDe } from "@/lib/sessao-token";
import { lerSessao } from "@/server/sessao";
import { Escolher } from "./escolher";

export const metadata: Metadata = {
  title: "Escolher distribuidora — Abastex",
  robots: { index: false },
};

/** Só o TI escolhe: os outros já têm a distribuidora do cadastro. */
export default async function EscolherDistribuidoraPage() {
  const s = await lerSessao();
  if (!s) redirect("/auth");
  if (s.prov || s.papel !== "ti") redirect(areaDe(s));
  return <Escolher atual={s.dist} />;
}
