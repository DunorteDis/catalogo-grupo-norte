"use client";

import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BookOpen,
  LayoutDashboard,
  Link2,
  LogOut,
  Moon,
  Package,
  ShoppingBag,
  Sun,
  Users,
  Warehouse,
} from "lucide-react";

import { chamar } from "@/lib/chamar";
import { usuarioDeEmail } from "@/lib/acessos";
import { cn } from "@/lib/utils";
import logoEscuro from "@/assets/abastex/abastex-logo-dark.png";
import simboloEscuro from "@/assets/abastex/abastex-symbol-dark.png";
import { Button } from "@/components/ui/button";
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

// Ícones do mapa de navegação do DS Abastex.
const MENU_ADMIN: Grupo[] = [
  {
    titulo: "Gestão",
    itens: [
      { to: "/admin", label: "Visão geral", icon: LayoutDashboard, exact: true },
      { to: "/admin/distribuidoras", label: "Distribuidoras", icon: Warehouse },
      { to: "/admin/produtos", label: "Produtos", icon: Package },
      { to: "/admin/catalogo", label: "Catálogos", icon: BookOpen },
    ],
  },
  { titulo: "Operação", itens: [{ to: "/admin/pedidos", label: "Pedidos", icon: ShoppingBag }] },
  { titulo: "Administração", itens: [{ to: "/admin/usuarios", label: "Usuários", icon: Users }] },
];

const MENU_VENDEDOR: Grupo[] = [
  {
    titulo: "Vendas",
    itens: [
      { to: "/vendedor", label: "Meus links", icon: Link2 },
      { to: "/meus-pedidos", label: "Pedidos", icon: ShoppingBag },
    ],
  },
];

function useTemaEscuro() {
  // null até montar: localStorage não existe no servidor.
  const [escuro, setEscuro] = useState<boolean | null>(null);
  useEffect(() => setEscuro(localStorage.getItem("tema") === "dark"), []);
  useEffect(() => {
    if (escuro === null) return;
    // O DS troca todas as cores por data-theme no <html>.
    document.documentElement.setAttribute("data-theme", escuro ? "dark" : "light");
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
  const usuario = usuarioDeEmail(email);

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await chamar(encerrarSessao());
    router.replace("/auth");
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r-0">
        <SidebarHeader className="h-16 flex-row items-center border-b border-sidebar-border px-5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <img
            src={logoEscuro.src}
            alt="Abastex"
            className="h-[26px] w-auto group-data-[collapsible=icon]:hidden"
          />
          <img
            src={simboloEscuro.src}
            alt="Abastex"
            className="hidden size-8 group-data-[collapsible=icon]:block"
          />
        </SidebarHeader>

        <SidebarContent className="gap-5 py-4">
          {grupos.map((g) => (
            <SidebarGroup key={g.titulo} className="px-3 py-0">
              <SidebarGroupLabel className="h-auto px-3 pb-2 text-[11px] font-semibold uppercase leading-4 tracking-[0.12em] text-sidebar-muted">
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
                        {ativo && (
                          <span
                            aria-hidden
                            className="absolute -left-3 top-2.5 bottom-2.5 w-1 rounded-r bg-sidebar-marker"
                          />
                        )}
                        <SidebarMenuButton
                          asChild
                          isActive={ativo}
                          tooltip={i.label}
                          className="h-10 gap-3 px-3 font-medium text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground data-[active=true]:bg-sidebar-primary data-[active=true]:font-semibold data-[active=true]:text-sidebar-foreground group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:!size-10 group-data-[collapsible=icon]:!p-[11px] [&>svg]:size-[18px] [&>svg]:text-sidebar-muted data-[active=true]:[&>svg]:text-sidebar-marker"
                        >
                          <Link href={i.to} aria-current={ativo ? "page" : undefined}>
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

        <SidebarFooter className="flex-row items-center gap-3 border-t border-sidebar-border px-5 py-4 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-0">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-full bg-mint text-[13px] font-bold uppercase text-on-mint"
            title={usuario}
          >
            {usuario.slice(0, 2)}
          </span>
          <div className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
            <strong className="truncate text-[13px] font-semibold text-sidebar-foreground">
              {usuario}
            </strong>
            <span className="text-xs text-sidebar-muted">
              {admin ? "Administrador" : "Vendedor"}
            </span>
          </div>
          <button
            type="button"
            onClick={sair}
            title="Sair"
            aria-label="Sair"
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="size-[18px]" />
          </button>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b bg-card px-4 md:px-8">
          <span
            aria-hidden
            className={cn(
              "absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary transition-opacity",
              buscando ? "animate-pulse opacity-100" : "opacity-0",
            )}
          />
          <SidebarTrigger className="size-8" aria-label="Recolher menu" />
          <span className="flex-1" />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setEscuro(!escuro)}
            aria-label={escuro ? "Modo claro" : "Modo escuro"}
            title={escuro ? "Modo claro" : "Modo escuro"}
          >
            {escuro ? <Sun /> : <Moon />}
          </Button>
        </header>
        <main className="flex-1 px-4 pb-8 pt-6 md:px-8">{montado ? children : null}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
