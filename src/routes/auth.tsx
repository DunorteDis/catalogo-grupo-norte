import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { mensagemErro } from "@/lib/erros";
import { loginParaEmail } from "@/lib/acessos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import logoBranco from "@/assets/gruponorte-branco.png";
import logoEscuro from "@/assets/gruponorte.png";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Grupo Norte Distribuição" },
      { name: "description", content: "Acesso à plataforma de catálogo do Grupo Norte." },
      { property: "og:title", content: "Entrar — Grupo Norte Distribuição" },
      { property: "og:description", content: "Acesso à plataforma de catálogo do Grupo Norte." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

const DESTAQUES = [
  { valor: "01", texto: "link por vendedor e distribuidora" },
  { valor: "00", texto: "aplicativos para o cliente instalar" },
  { valor: "24/7", texto: "catálogo no ar para receber pedidos" },
] as const;

function AuthPage() {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function irParaArea(userId: string) {
    const { data: admin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    navigate({ to: admin ? "/admin" : "/vendedor", replace: true });
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) void irParaArea(data.user.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginParaEmail(usuario),
        password: senha,
      });
      if (error) throw error;
      await irParaArea(data.user.id);
    } catch (err) {
      toast.error(mensagemErro(err, "Não foi possível entrar. Tente novamente."));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between bg-ink px-14 py-12 lg:flex">
        <img src={logoBranco} alt="Grupo Norte Distribuição" className="h-10 w-auto self-start" />

        <div className="max-w-md">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.25em] text-primary">
            Catálogo digital
          </p>
          <h1 className="mt-6 text-5xl font-extrabold leading-[1.05] tracking-tight text-white">
            Pedidos direto
            <br />
            no WhatsApp
          </h1>
          <p className="mt-6 text-base leading-relaxed text-white/60">
            Cada vendedor tem um link próprio com os produtos da sua distribuidora. O cliente
            escolhe, conclui e o pedido chega pronto — sem planilha, sem retrabalho.
          </p>

          <dl className="mt-12 space-y-4">
            {DESTAQUES.map((d) => (
              <div key={d.valor} className="flex items-baseline gap-6">
                <dt className="w-16 shrink-0 font-mono text-xl font-bold text-primary">
                  {d.valor}
                </dt>
                <dd className="text-sm text-white/55">{d.texto}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="text-xs text-white/35">
          © {new Date().getFullYear()} Grupo Norte Distribuição · Uso interno
        </p>
      </aside>

      <main className="flex items-center justify-center bg-background px-6 py-16">
        <div className="w-full max-w-sm">
          <img
            src={logoEscuro}
            alt="Grupo Norte Distribuição"
            className="mb-10 h-7 w-auto lg:hidden"
          />

          <h2 className="text-3xl font-extrabold tracking-tight">Entrar na plataforma</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Use o usuário e a senha que o administrador enviou.
          </p>

          <form onSubmit={enviar} className="mt-8 rounded-2xl border bg-card p-6 shadow-sm">
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
                  className="h-11 rounded-xl"
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
                  className="h-11 rounded-xl"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={carregando}
              className="mt-6 h-11 w-full rounded-xl font-bold"
            >
              {carregando ? "Aguarde..." : "Entrar"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Novos acessos são criados pelo administrador dentro do sistema.
          </p>
        </div>
      </main>
    </div>
  );
}
