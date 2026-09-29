import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { lerSessao } from "@/server/sessao";

// Navegação só: as actions de admin conferem o papel no banco a cada chamada.
export default async function AreaAdmin({ children }: { children: ReactNode }) {
  const s = await lerSessao();
  if (!s || s.papel === "vendedor") redirect("/vendedor");
  return children;
}
