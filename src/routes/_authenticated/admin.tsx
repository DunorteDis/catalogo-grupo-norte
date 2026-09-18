import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

const LINKS = [
  { to: "/admin", label: "Início" },
  { to: "/admin/vendedores", label: "Vendedores" },
  { to: "/admin/distribuidoras", label: "Distribuidoras" },
  { to: "/admin/produtos", label: "Produtos" },
  { to: "/admin/pedidos", label: "Pedidos" },
] as const;

function AdminLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <span className="text-sm font-extrabold">Administração</span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={sair}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2">
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeOptions={{ exact: l.to === "/admin" }}
              activeProps={{ className: "bg-primary text-primary-foreground" }}
              className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-muted"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
