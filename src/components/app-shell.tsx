"use client";

import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BookOpen,
  ChevronRight,
  LayoutDashboard,
  Link2,
  LogOut,
  MessageCircle,
  Moon,
  Package,
  ShoppingBag,
  Store,
  Sun,
  Users,
  WalletCards,
  Warehouse,
} from "lucide-react";

import { chamar } from "@/lib/chamar";
import { usuarioDeEmail } from "@/lib/acessos";
import type { Papel } from "@/lib/sessao-token";
import { cn } from "@/lib/utils";
import logoEscuro from "@/assets/abastex/abastex-logo-dark.png";
import simboloEscuro from "@/assets/abastex/abastex-symbol-dark.png";
import { Button } from "@/components/ui/button";
import { AvisoWhatsapp } from "@/components/whatsapp/conexao";
import { ConversasContexto } from "@/hooks/use-conversas";
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
  useSidebar,
} from "@/components/ui/sidebar";
import { sair as encerrarSessao } from "@/server/auth";

type Item = {
  to: string;
  label: string;
  icon: typeof Users;
  exact?: boolean;
  soTI?: boolean;
  /** Módulo de Conversas, ainda em desenvolvimento (veConversas). */
  conversas?: boolean;
};
type Grupo = { titulo: string; itens: Item[] };

// Ícones do mapa de navegação do DS Abastex.
const MENU_ADMIN: Grupo[] = [
  {
    titulo: "Gestão",
    itens: [
      { to: "/admin", label: "Visão geral", icon: LayoutDashboard, exact: true },
      { to: "/admin/distribuidoras", label: "Distribuidoras", icon: Warehouse, soTI: true },
      { to: "/admin/produtos", label: "Produtos", icon: Package },
      { to: "/admin/catalogo", label: "Catálogos", icon: BookOpen },
      { to: "/admin/clientes", label: "Clientes", icon: Store },
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
      { to: "/conversas", label: "Conversas", icon: MessageCircle, conversas: true },
      { to: "/carteira", label: "Minha carteira", icon: WalletCards },
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

/**
 * Comportamento do menu conforme a tela: no celular fecha ao navegar; no tablet
 * (768–1023px) começa recolhido em ícones, para sobrar espaço para o conteúdo.
 */
function ControleDoMenu() {
  const { isMobile, setOpenMobile, setOpen } = useSidebar();
  const pathname = usePathname();
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [pathname, isMobile, setOpenMobile]);
  useEffect(() => {
    const tablet = window.matchMedia("(min-width: 768px) and (max-width: 1023px)");
    const ajustar = () => setOpen(!tablet.matches);
    ajustar();
    tablet.addEventListener("change", ajustar);
    return () => tablet.removeEventListener("change", ajustar);
  }, [setOpen]);
  return null;
}

/** Abre o menu no celular; no computador recolhe/expande. O nome diz o que vai acontecer. */
function BotaoMenu() {
  const { isMobile, open, openMobile } = useSidebar();
  const rotulo = isMobile ? "Abrir menu" : open ? "Recolher menu" : "Expandir menu";
  return (
    <SidebarTrigger
      className="size-9"
      aria-label={rotulo}
      title={rotulo}
      aria-expanded={isMobile ? openMobile : open}
    />
  );
}

export function AppShell({
  email,
  papel,
  distribuidora,
  conversas,
  children,
}: {
  email: string;
  papel: Papel;
  /** Nome da distribuidora em uso. */
  distribuidora: string | null;
  /** Vê o módulo de Conversas (em desenvolvimento: só TI e vendedor piloto). */
  conversas: boolean;
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
  // Só o que a tela ainda não tem: a atualização de fundo (a cada 5 s nas Conversas)
  // acenderia a barra o tempo todo e a página pareceria piscar.
  const buscando = useIsFetching({ predicate: (q) => q.state.status === "pending" }) > 0;

  const admin = papel !== "vendedor";
  // Distribuidoras é só do TI; grupo que ficar vazio some.
  const grupos = (admin ? MENU_ADMIN : MENU_VENDEDOR)
    .map((g) => ({
      ...g,
      itens: g.itens.filter((i) => (!i.soTI || papel === "ti") && (!i.conversas || conversas)),
    }))
    .filter((g) => g.itens.length > 0);
  const usuario = usuarioDeEmail(email);
  const estaEm = (i: Item) =>
    i.exact ? pathname === i.to : pathname === i.to || pathname.startsWith(`${i.to}/`);
  // A página atual, para a barra do topo; a mais específica vence (/admin/x e não /admin).
  const atual = grupos
    .flatMap((g) => g.itens)
    .filter(estaEm)
    .sort((a, b) => b.to.length - a.to.length)[0];

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
            className="h-6.5 w-auto group-data-[collapsible=icon]:hidden"
          />
          <img
            src={simboloEscuro.src}
            alt="Abastex"
            className="hidden size-8 group-data-[collapsible=icon]:block"
          />
        </SidebarHeader>

        <SidebarContent className="gap-5 py-4">
          {distribuidora && (
            <div className="mx-3 flex items-center justify-between gap-2 rounded-md bg-sidebar-accent px-3 py-2 group-data-[collapsible=icon]:hidden">
              <div className="min-w-0">
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-sidebar-muted">
                  Distribuidora
                </p>
                <p className="truncate text-[0.8125rem] font-semibold text-sidebar-foreground">
                  {distribuidora}
                </p>
              </div>
              {papel === "ti" && (
                <Link
                  href="/escolher-distribuidora"
                  className="shrink-0 text-xs font-semibold text-sidebar-marker hover:underline"
                >
                  Trocar
                </Link>
              )}
            </div>
          )}
          {grupos.map((g) => (
            <SidebarGroup key={g.titulo} className="px-3 py-0">
              <SidebarGroupLabel className="h-auto px-3 pb-2 text-[0.6875rem] font-semibold uppercase leading-4 tracking-[0.12em] text-sidebar-muted">
                {g.titulo}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {g.itens.map((i) => {
                    const ativo = estaEm(i);
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
                          className="h-10 gap-3 px-3 font-medium text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground data-[active=true]:bg-sidebar-primary data-[active=true]:font-semibold data-[active=true]:text-sidebar-foreground group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:!size-10 group-data-[collapsible=icon]:!p-[0.6875rem] [&>svg]:size-4.5 [&>svg]:text-sidebar-muted data-[active=true]:[&>svg]:text-sidebar-marker"
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
            className="grid size-9 shrink-0 place-items-center rounded-full bg-mint text-[0.8125rem] font-bold uppercase text-on-mint"
            title={usuario}
          >
            {usuario.slice(0, 2)}
          </span>
          <div className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
            <strong className="truncate text-[0.8125rem] font-semibold text-sidebar-foreground">
              {usuario}
            </strong>
            <span className="text-xs text-sidebar-muted">
              {papel === "ti" ? "TI" : admin ? "Administrador" : "Vendedor"}
            </span>
          </div>
          <button
            type="button"
            onClick={sair}
            title="Sair"
            aria-label="Sair"
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="size-4.5" />
          </button>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      {/* min-w-0: sem ele a área principal cresce até caber o conteúdo mais largo e a
          página inteira ganha rolagem horizontal (tablet em Clientes e Produtos). */}
      <SidebarInset className="min-w-0">
        <ControleDoMenu />
        {/* Barra do topo: onde a pessoa está e as ações que valem em qualquer tela. */}
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3 sm:gap-3 sm:px-6 md:h-16 lg:px-8">
          <span
            aria-hidden
            className={cn(
              "absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary transition-opacity",
              buscando ? "animate-pulse opacity-100" : "opacity-0",
            )}
          />
          <BotaoMenu />
          <span aria-hidden className="h-5 w-px shrink-0 bg-line" />
          <nav aria-label="Você está em" className="min-w-0 flex-1">
            <ol className="flex min-w-0 items-center gap-1.5 text-sm">
              {distribuidora && (
                <li className="hidden shrink-0 items-center gap-1.5 text-ink-muted sm:flex">
                  {distribuidora}
                  {atual && <ChevronRight aria-hidden className="size-4 text-ink-subtle" />}
                </li>
              )}
              {atual && (
                <li aria-current="page" className="truncate font-semibold text-ink">
                  {atual.label}
                </li>
              )}
            </ol>
          </nav>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setEscuro(!escuro)}
            aria-label={escuro ? "Usar modo claro" : "Usar modo escuro"}
            title={escuro ? "Modo claro" : "Modo escuro"}
          >
            {escuro ? <Sun /> : <Moon />}
          </Button>
        </header>
        {montado && conversas && <AvisoWhatsapp />}
        {/* Largura máxima: em monitor grande o conteúdo não se espalha de ponta a ponta. */}
        <main className="flex-1">
          <div className="mx-auto w-full max-w-360 px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-6">
            <ConversasContexto.Provider value={conversas}>
              {montado ? children : null}
            </ConversasContexto.Provider>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
