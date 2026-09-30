"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { chamar } from "@/lib/chamar";
import { mensagemErro } from "@/lib/erros";
import { entrar } from "@/server/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import logoClaro from "@/assets/abastex/abastex-logo.png";
import logoEscuro from "@/assets/abastex/abastex-logo-dark.png";

const DESTAQUES = [
  { valor: "01", texto: "link por vendedor e distribuidora" },
  { valor: "00", texto: "aplicativos para o cliente instalar" },
  { valor: "24/7", texto: "catálogo no ar para receber pedidos" },
] as const;

export function FormLogin() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    try {
      const destino = await chamar(entrar(usuario, senha));
      router.replace(destino);
    } catch (err) {
      toast.error(mensagemErro(err, "Não foi possível entrar. Tente novamente."));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between bg-sidebar px-14 py-12 lg:flex">
        <img src={logoEscuro.src} alt="Abastex" className="h-9 w-auto self-start" />

        <div className="max-w-md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mint">
            Catálogo digital
          </p>
          <h1 className="mt-6 text-5xl font-bold leading-[1.05] tracking-tight text-sidebar-foreground">
            Pedidos direto
            <br />
            no WhatsApp
          </h1>
          <p className="mt-6 text-base leading-relaxed text-sidebar-muted">
            Cada vendedor tem um link próprio com os produtos da sua distribuidora. O cliente
            escolhe, conclui e o pedido chega pronto — sem planilha, sem retrabalho.
          </p>

          <dl className="mt-12 space-y-4">
            {DESTAQUES.map((d) => (
              <div key={d.valor} className="flex items-baseline gap-6">
                <dt className="w-16 shrink-0 font-mono text-xl font-bold text-mint">{d.valor}</dt>
                <dd className="text-sm text-sidebar-muted">{d.texto}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="text-xs text-sidebar-muted/70">
          © {new Date().getFullYear()} Grupo Norte Distribuição · Uso interno
        </p>
      </aside>

      <main className="flex items-center justify-center bg-background px-6 py-16">
        <div className="w-full max-w-sm">
          <img
            src={logoClaro.src}
            alt="Abastex"
            className="mb-10 h-7 w-auto lg:hidden dark:hidden"
          />
          <img
            src={logoEscuro.src}
            alt="Abastex"
            className="mb-10 hidden h-7 w-auto dark:block lg:dark:hidden"
          />

          <h2 className="text-[32px] font-bold leading-[38px] tracking-tight">Entrar no Abastex</h2>
          <p className="mt-2 text-ink-muted">Use o usuário e a senha que o administrador enviou.</p>

          <form onSubmit={enviar} className="ax-card mt-8 p-6">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="usuario">Usuário</Label>
                <Input
                  id="usuario"
                  autoComplete="username"
                  placeholder="primeiro.ultimo"
                  required
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="senha">Senha</Label>
                <Input
                  id="senha"
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={6}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                />
              </div>
            </div>

            <Button type="submit" disabled={carregando} className="mt-6 w-full">
              {carregando ? "Aguarde..." : "Entrar"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-ink-muted">
            Novos acessos são criados pelo administrador dentro do sistema.
          </p>
        </div>
      </main>
    </div>
  );
}
