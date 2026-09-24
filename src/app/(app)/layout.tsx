import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { lerSessao } from "@/server/sessao";

export default async function AreaLogada({ children }: { children: ReactNode }) {
  const s = await lerSessao();
  if (!s) redirect("/auth");
  if (s.prov) redirect("/definir-senha");
  return (
    <AppShell email={s.email} admin={s.admin}>
      {children}
    </AppShell>
  );
}
