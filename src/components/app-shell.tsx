"use client";

import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BookOpen,
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

import { chamar } from "@/lib/chamar";
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
import { sair as encerrarSessao } from "@/server/auth";

type Item = { to: string; label: string; icon: typeof Users; exact?: boolean };
type Grupo = { titulo: string; itens: Item[] };

const MENU_ADMIN: Grupo[] = [
  {
    titulo: "Gestão",
    itens: [
      { to: "/admin", label: "Visão geral", icon: LayoutDashboard, exact: true },
      { to: "/admin/distribuidoras", label: "Distribuidoras", icon: Boxes },
      { to: "/admin/produtos", label: "Produtos", icon: Package },
      { to: "/admin/catalogo", label: "Catálogos", icon: BookOpen },
    ],
  },
  { titulo: "Operação", itens: [{ to: "/admin/pedidos", label: "Pedidos", icon: ScrollText }] },
  { titulo: "Administração", itens: [{ to: "/admin/usuarios", label: "Usuários", icon: Users }] },
];

const MENU_VENDEDOR: Grupo[] = [
  {
    titulo: "Vendas",
    itens: [
      { to: "/vendedor", label: "Meus links", icon: Link2 },
      { to: "/meus-pedidos", label: "Pedidos", icon: ScrollText },
    ],
  },
];

function useTemaEscuro() {
  // null até montar: localStorage não existe no servidor.
  const [escuro, setEscuro] = useState<boolean | null>(null);
  useEffect(() => setEscuro(localStorage.getItem("tema") === "dark"), []);
  useEffect(() => {
    if (escuro === null) return;
    document.documentElement.classList.toggle("dark", escuro);
    localStorage.setItem("tema", escuro ? "dark" : "light");
  }, [escuro]);
  return [!!escuro, (v: boolean) => setEscuro(v)] as const;
}

export function AppShell({
  email,
  admin,
  children,
}: {
  email: string;
  admin: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [escuro, setEscuro] = useTemaEscuro();
  const pathname = usePathname();
  // ponytail: as telas logadas eram ssr:false no TanStack e leem window e
  // localStorage no render. Montar o conteúdo só no navegador mantém isso; o
  // shell em volta continua vindo do servidor.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  // ponytail: uma barra no shell cobre toda tela que busca dados, em vez de um
  // estado de carregamento por pagina. Nenhuma pagina admin tinha um.
  const buscando = useIsFetching() > 0;

  const grupos = admin ? MENU_ADMIN : MENU_VENDEDOR;
  const itens = grupos.flatMap((g) => g.itens);
  const atual = itens
    .filter((i) => pathname === i.to || pathname.startsWith(`${i.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0];

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await chamar(encerrarSessao());
    router.replace("/auth");
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="h-16 justify-center border-b border-sidebar-border px-4">
          <img
            src={logoBranco.src}
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
                  {g.itens.map((i) => {
                    const ativo = i.exact
                      ? pathname === i.to
                      : pathname === i.to || pathname.startsWith(`${i.to}/`);
                    return (
                      <SidebarMenuItem key={i.to}>
                        <SidebarMenuButton asChild tooltip={i.label}>
                          <Link
                            href={i.to}
                            className={cn(
                              ativo &&
                                "bg-sidebar-primary text-sidebar-primary-foreground font-semibold hover:bg-sidebar-primary hover:text-sidebar-primary-foreground",
                            )}
                          >
                            <i.icon />
                            <span>{i.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter className="gap-3 border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 group-data-[collapsible=icon]:hidden">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-bold uppercase text-sidebar-primary-foreground">
              {email.slice(0, 2)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-sidebar-foreground">{email}</p>
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
        <main className="flex-1 p-6">{montado ? children : null}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
