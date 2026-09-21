import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { mensagemErro } from "@/lib/erros";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acesso administrativo — Catálogo Norte" },
      { name: "description", content: "Área restrita para administradores do catálogo." },
      { property: "og:title", content: "Acesso administrativo — Catálogo Norte" },
      { property: "og:description", content: "Área restrita para administradores do catálogo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
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
        email,
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
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <form onSubmit={enviar} className="w-full max-w-sm rounded-2xl border bg-card p-6">
        <h1 className="text-2xl font-extrabold">Entrar</h1>
        <p className="mt-1 text-sm text-muted-foreground">Área administrativa do catálogo.</p>

        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="senha">Senha</Label>
            <Input
              id="senha"
              type="password"
              required
              minLength={6}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>
        </div>

        <Button type="submit" disabled={carregando} className="mt-6 h-11 w-full rounded-xl font-bold">
          {carregando ? "Aguarde..." : "Entrar"}
        </Button>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Novos acessos são criados pelo administrador dentro do sistema.
        </p>
      </form>
    </div>
  );
}
