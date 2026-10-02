"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Eye, EyeOff, Link2, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { chamar } from "@/lib/chamar";
import { mensagemErro } from "@/lib/erros";
import { cn } from "@/lib/utils";
import { entrar } from "@/server/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import logoClaro from "@/assets/abastex/abastex-logo.png";
import logoEscuro from "@/assets/abastex/abastex-logo-dark.png";
import grupoNorte from "@/assets/logos/gruponorte.png";
import grupoNorteEscuro from "@/assets/logos/gruponorte-dark.png";
import nic from "@/assets/nic/nic.png";
import nicEscuro from "@/assets/nic/nic-dark.png";

import { FundoPixels } from "./fundo-pixels";

/** "abastex" do logo + "Connect", o nome do produto. `escuro`: versão para fundo escuro. */
function Marca({ escuro, className }: { escuro?: boolean; className?: string }) {
  return (
    <span className={cn("flex items-end gap-2", className)}>
      <img src={(escuro ? logoEscuro : logoClaro).src} alt="Abastex" className="h-full w-auto" />
      <span
        className={cn(
          "pb-[0.08em] text-[1.35em] font-medium leading-none tracking-tight",
          escuro ? "text-sidebar-foreground/80" : "text-ink-muted",
        )}
      >
        Connect
      </span>
    </span>
  );
}

/**
 * O ciclo do produto numa cena parada: a mensagem do cliente no WhatsApp chega ao CRM já
 * com o cliente da carteira, o crédito e o pedido ligado à conversa. Cliente fictício.
 */
function Cena() {
  return (
    <div aria-hidden className="relative mt-14 max-w-md select-none">
      <div className="w-fit max-w-76 rounded-2xl rounded-tl-sm bg-surface px-4 py-3 text-sm text-ink shadow-float">
        Bom dia! Manda 10 caixas daquele sabão de sempre, por favor.
        <span className="ml-3 align-bottom text-[0.6875rem] text-ink-subtle">09:12</span>
      </div>

      {/* A mensagem desce até o CRM: a linha diz "chegou e virou isso". */}
      <span className="ml-14 block h-5 w-px border-l border-dashed border-sidebar-muted/60" />

      <div className="ml-8 rounded-2xl border border-sidebar-border bg-sidebar/80 p-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-mint text-sm font-bold text-on-mint">
            MB
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-sidebar-foreground">Mercadinho Bom Preço</p>
            <p className="text-xs text-sidebar-muted">
              Cliente da sua carteira, reconhecido pelo celular
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-mint/15 px-2.5 py-1 text-mint">
            <CircleCheck className="size-3.5" />
            Crédito liberado
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sidebar-foreground/10 px-2.5 py-1 text-sidebar-foreground">
            <Link2 className="size-3.5" />
            Pedido ligado à conversa
          </span>
        </div>
      </div>
    </div>
  );
}

export function FormLogin() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const campoUsuario = useRef<HTMLInputElement>(null);
  // Foco no usuário só com mouse: no celular abriria o teclado por cima da tela.
  useEffect(() => {
    if (matchMedia("(pointer: fine)").matches) campoUsuario.current?.focus();
  }, []);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    try {
      const destino = await chamar(entrar(usuario, senha));
      router.replace(destino);
    } catch (err) {
      toast.error(mensagemErro(err, "Não foi possível entrar. Tente novamente."));
      setCarregando(false);
    }
  }

  const conferirCaps = (e: React.KeyboardEvent) => setCapsLock(e.getModifierState("CapsLock"));

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="relative isolate hidden flex-col justify-between overflow-hidden bg-sidebar px-14 py-12 lg:flex">
        {/* Campo de quadrados que se adensa para baixo, atrás do conteúdo. */}
        <FundoPixels className="absolute inset-0 -z-10 size-full" />

        <Marca escuro className="h-9 text-[1.75rem]" />

        <div>
          <h1 className="max-w-md text-balance text-[2.75rem] font-bold leading-[1.08] tracking-tight text-sidebar-foreground">
            O CRM de vendas pelo WhatsApp
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-sidebar-muted">
            Atenda os clientes pelo WhatsApp, veja crédito e títulos de quem está falando com você e
            acompanhe os pedidos da sua carteira.
          </p>
          <Cena />
        </div>

        {/* Fundo próprio: o rodapé fica sobre a parte mais densa dos quadrados. */}
        <p className="-mx-2 w-fit rounded-md bg-sidebar px-2 py-1 text-xs text-sidebar-muted">
          © {new Date().getFullYear()} Grupo Norte Distribuição. Uso interno.
        </p>
      </aside>

      <main className="flex flex-col bg-background px-6 py-10 sm:px-10">
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
          <Marca className="mb-12 h-7 text-[1.4rem] lg:hidden dark:hidden" />
          <Marca escuro className="mb-12 hidden h-7 text-[1.4rem] dark:flex lg:dark:hidden" />

          <h2 className="text-[1.75rem] font-bold leading-tight tracking-tight">Entrar</h2>
          <p className="mt-2 text-ink-muted">Use o usuário e a senha que o administrador enviou.</p>

          <form onSubmit={enviar} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="usuario">Usuário</Label>
              <Input
                id="usuario"
                ref={campoUsuario}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="primeiro.ultimo"
                required
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <div className="relative">
                <Input
                  id="senha"
                  type={verSenha ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  minLength={6}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  onKeyDown={conferirCaps}
                  onKeyUp={conferirCaps}
                  onBlur={() => setCapsLock(false)}
                  aria-describedby={capsLock ? "aviso-caps" : undefined}
                  className="h-11 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setVerSenha((v) => !v)}
                  aria-label={verSenha ? "Esconder senha" : "Mostrar senha"}
                  aria-pressed={verSenha}
                  title={verSenha ? "Esconder senha" : "Mostrar senha"}
                  className="absolute inset-y-0 right-0 grid w-11 cursor-pointer place-items-center rounded-r-md text-ink-subtle hover:text-ink"
                >
                  {verSenha ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
                </button>
              </div>
              {capsLock && (
                <p
                  id="aviso-caps"
                  className="flex items-center gap-1.5 text-xs font-medium text-warning"
                >
                  <TriangleAlert className="size-3.5" aria-hidden />
                  Caps Lock está ligado.
                </p>
              )}
            </div>

            <Button type="submit" disabled={carregando} className="h-11 w-full text-[0.9375rem]">
              {carregando && <Loader2 className="animate-spin" aria-hidden />}
              {carregando ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          <p className="mt-6 text-sm text-ink-muted">
            Esqueceu a senha ou ainda não tem acesso? Fale com o administrador do sistema: ele gera
            uma senha nova na hora.
          </p>
        </div>

        {/* Assinatura: versão escura dos logos no tema escuro. */}
        <footer className="mx-auto mt-10 flex w-full max-w-sm flex-col items-center gap-3 border-t pt-6">
          <span className="text-xs text-ink-subtle">Desenvolvido por</span>
          <div className="flex items-center gap-4">
            <img
              src={grupoNorte.src}
              alt="Grupo Norte Distribuição"
              className="h-8 w-auto dark:hidden"
            />
            <img
              src={grupoNorteEscuro.src}
              alt="Grupo Norte Distribuição"
              className="hidden h-8 w-auto dark:block"
            />
            <span className="h-7 w-px bg-line-strong" aria-hidden />
            <img src={nic.src} alt="NIC" className="h-5 w-auto dark:hidden" />
            <img src={nicEscuro.src} alt="NIC" className="hidden h-5 w-auto dark:block" />
          </div>
        </footer>
      </main>
    </div>
  );
}
