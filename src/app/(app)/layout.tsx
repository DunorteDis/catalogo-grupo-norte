import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { destinoDoAcesso, distEmUso } from "@/lib/sessao-token";
import { sql } from "@/server/db";
import { acessoDe, lerSessao } from "@/server/sessao";

export default async function AreaLogada({ children }: { children: ReactNode }) {
  const s = await lerSessao();
  if (!s) redirect("/auth");
  // O banco manda, não o token: conta apagada ou distribuidora desligada volta ao
  // login (que diz o porquê), e o TI numa distribuidora desligada volta a escolher.
  // A trava de verdade continua sendo o exigirLogin de cada action.
  const a = await acessoDe(s.sub, s.dist);
  const destino = destinoDoAcesso(a, s.prov);
  if (!a?.papel || !destino) redirect("/auth");
  if (destino === "/definir-senha" || destino === "/escolher-distribuidora") redirect(destino);
  const [d] = await sql<{ nome: string }[]>`
    select nome from distribuidoras where id = ${distEmUso({ ...a, papel: a.papel })}`;
  return (
    <AppShell email={s.email} papel={a.papel} distribuidora={d?.nome ?? null}>
      {children}
    </AppShell>
  );
}
