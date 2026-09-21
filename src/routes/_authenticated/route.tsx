import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Boxes,
  LayoutDashboard,
  Link2,
  LogOut,
  Moon,
  Package,
  ScrollText,
  Sun,
  UserCog,
  Users,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import logoBranco from "@/assets/gruponorte-branco.png";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    // beforeLoad reroda a cada navegacao (nao e cache, por design do TanStack).
    // ponytail: getSession() le do storage local; getUser() ia na rede toda vez
    // (~600ms). Aqui a checagem e so UX — quem barra de verdade e o RLS no banco.
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) throw redirect({ to: "/auth" });

    // Papel nao muda no meio da sessao. Cacheado no queryClient, que o logout ja
    // limpa. Se um admin for rebaixado, a UI so acompanha no proximo login — a
    // escrita continua bloqueada pelo RLS de qualquer forma.
    const admin = await context.queryClient.ensureQueryData({
      queryKey: ["has-role", user.id, "admin"],
      queryFn: async () => {
        const { data: tem } = await supabase.rpc("has_role", {
          _user_id: user.id,
          _role: "admin",
        });
        return Boolean(tem);
      },
      staleTime: Infinity,
    });

    return { user, admin };
  },
  component: AppShell,
});

type Item = { to: string; label: string; icon: typeof Users; exact?: boolean };
type Grupo = { titulo: string; itens: Item[] };

const MENU_ADMIN: Grupo[] = [
  {
    titulo: "Gestão",
    itens: [
      { to: "/admin", label: "Visão geral", icon: LayoutDashboard, exact: true },
      { to: "/admin/distribuidoras", label: "Distribuidoras", icon: Boxes },
      { to: "/admin/produtos", label: "Produtos", icon: Package },
    ],
  },
  { titulo: "Operação", itens: [{ to: "/admin/pedidos", label: "Pedidos", icon: ScrollText }] },
  { titulo: "Administração", itens: [{ to: "/admin/usuarios", label: "Usuários", icon: Users }] },
];

const MENU_VENDEDOR: Grupo[] = [
  { titulo: "Vendas", itens: [{ to: "/vendedor", label: "Meus links", icon: Link2 }] },
];

function useTemaEscuro() {
  const [escuro, setEscuro] = useState(() => localStorage.getItem("tema") === "dark");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", escuro);
    localStorage.setItem("tema", escuro ? "dark" : "light");
  }, [escuro]);
  return [escuro, setEscuro] as const;
}

function AppShell() {
  const { user, admin } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [escuro, setEscuro] = useTemaEscuro();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // ponytail: uma barra no shell cobre toda tela que busca dados, em vez de um
  // estado de carregamento por pagina. Nenhuma pagina admin tinha um.
  const buscando = useIsFetching() > 0;

  const grupos = admin ? MENU_ADMIN : MENU_VENDEDOR;
  const itens = grupos.flatMap((g) => g.itens);
  const atual = itens
    .filter((i) => pathname === i.to || pathname.startsWith(`${i.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0];

  // getSession() nao valida no servidor; se a sessao for revogada/expirar, o
  // supabase-js emite SIGNED_OUT e devolvemos o usuario pro login.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_OUT") navigate({ to: "/auth", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="h-16 justify-center border-b border-sidebar-border px-4">
          <img
            src={logoBranco}
            alt="Grupo Norte Distribuição"
            className="h-7 w-auto self-start group-data-[collapsible=icon]:hidden"
          />
        </SidebarHeader>

        <SidebarContent className="py-2">
          {grupos.map((g) => (
            <SidebarGroup key={g.titulo}>
              <SidebarGroupLabel className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/40">
                {g.titulo}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {g.itens.map((i) => (
                    <SidebarMenuItem key={i.to}>
                      <SidebarMenuButton asChild tooltip={i.label}>
                        <Link
                          to={i.to}
                          activeOptions={{ exact: i.exact ?? false }}
                          activeProps={{
                            className:
                              "bg-sidebar-primary text-sidebar-primary-foreground font-semibold hover:bg-sidebar-primary hover:text-sidebar-primary-foreground",
                          }}
                        >
                          <i.icon />
                          <span>{i.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter className="gap-3 border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 group-data-[collapsible=icon]:hidden">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-bold uppercase text-sidebar-primary-foreground">
              {(user.email ?? "?").slice(0, 2)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-sidebar-foreground">{user.email}</p>
              <p className="text-xs text-sidebar-foreground/45">
                {admin ? "Administrador" : "Vendedor"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 group-data-[collapsible=icon]:grid-cols-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEscuro(!escuro)}
              className="border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              {escuro ? <Sun /> : <Moon />}
              <span className="group-data-[collapsible=icon]:hidden">
                {escuro ? "Claro" : "Escuro"}
              </span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={sair}
              className="border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <LogOut />
              <span className="group-data-[collapsible=icon]:hidden">Sair</span>
            </Button>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b bg-background px-4">
          <span
            aria-hidden
            className={cn(
              "absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary transition-opacity",
              buscando ? "animate-pulse opacity-100" : "opacity-0",
            )}
          />
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <nav className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Grupo Norte</span>
            <span className="text-muted-foreground/40">/</span>
            <span className="font-semibold">{atual?.label ?? "Início"}</span>
          </nav>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
