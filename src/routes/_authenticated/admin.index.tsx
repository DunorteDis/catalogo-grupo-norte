import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminHome,
});

function AdminHome() {
  const { data } = useQuery({
    queryKey: ["admin-resumo"],
    queryFn: async () => {
      const [prod, dist, vend, ped] = await Promise.all([
        supabase.from("produtos").select("id", { count: "exact", head: true }),
        supabase.from("distribuidoras").select("id", { count: "exact", head: true }),
        supabase.from("vendedores").select("id", { count: "exact", head: true }),
        supabase.from("pedidos").select("id", { count: "exact", head: true }),
      ]);
      return {
        produtos: prod.count ?? 0,
        distribuidoras: dist.count ?? 0,
        vendedores: vend.count ?? 0,
        pedidos: ped.count ?? 0,
      };
    },
  });

  const cards = [
    { label: "Produtos", valor: data?.produtos, to: "/admin/produtos" },
    { label: "Distribuidoras", valor: data?.distribuidoras, to: "/admin/distribuidoras" },
    { label: "Vendedores", valor: data?.vendedores, to: "/admin/usuarios" },
    { label: "Pedidos", valor: data?.pedidos, to: "/admin/pedidos" },
  ] as const;

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Visão geral</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Cadastre um vendedor para gerar o link do catálogo que ele enviará aos clientes.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="rounded-2xl border bg-card p-5 hover:border-primary">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {c.label}
            </p>
            <p className="mt-2 text-3xl font-extrabold">{c.valor ?? "—"}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
