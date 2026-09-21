import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { mensagemErro } from "@/lib/erros";
import {
  CHAVE_SENHA_PROVISORIA,
  SENHA_MINIMO,
  senhaEhProvisoria,
  senhaFraca,
  usuarioDeEmail,
} from "@/lib/acessos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import logoBranco from "@/assets/gruponorte-branco.png";

export const Route = createFileRoute("/definir-senha")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Definir senha — Grupo Norte" }, { name: "robots", content: "noindex" }],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) throw redirect({ to: "/auth" });
    // Quem já trocou não volta para cá; o /admin repassa para /vendedor se não for admin.
    if (!senhaEhProvisoria(user.user_metadata)) throw redirect({ to: "/admin" });
    return { user };
  },
  component: DefinirSenhaPage,
});

function DefinirSenhaPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [salvando, setSalvando] = useState(false);

  const usuario = usuarioDeEmail(user.email ?? "");
  // O Supabase não tem freio de tentativa no login, então a única defesa contra
  // força bruta é a senha não ser adivinhável. A recusa é aqui, não no servidor.
  const problema = senha.length > 0 ? senhaFraca(senha, usuario) : null;
  const diferentes = confirma.length > 0 && senha !== confirma;
  const podeEnviar = senha.length > 0 && !senhaFraca(senha, usuario) && senha === confirma;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!podeEnviar) return;
    setSalvando(true);
    try {
      // Troca a senha e baixa a bandeira na mesma chamada: se a senha falhar, a
      // conta continua marcada como provisória e o bloqueio segue valendo.
      const { error } = await supabase.auth.updateUser({
        password: senha,
        data: { [CHAVE_SENHA_PROVISORIA]: false },
      });
      if (error) throw error;
      toast.success("Senha definida. Bom trabalho!");
      navigate({ to: "/admin", replace: true });
    } catch (err) {
      toast.error(mensagemErro(err, "Não foi possível definir a senha."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink px-6 py-12">
      <img src={logoBranco} alt="Grupo Norte Distribuição" className="h-8 w-auto" />

      <div className="mt-10 w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft">
          <KeyRound className="size-5 text-primary" />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight">Crie sua senha</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A senha que você recebeu é provisória e passou por WhatsApp. Escolha uma que só você saiba
          para continuar.
        </p>
        <p className="mt-3 font-mono text-xs text-muted-foreground">{usuario}</p>

        <form onSubmit={enviar} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nova">Nova senha</Label>
            <Input
              id="nova"
              type="password"
              autoComplete="new-password"
              autoFocus
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              aria-invalid={Boolean(problema)}
              className="h-11 rounded-xl"
            />
            <p className={problema ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {problema ?? `Mínimo de ${SENHA_MINIMO} caracteres.`}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirma">Repita a senha</Label>
            <Input
              id="confirma"
              type="password"
              autoComplete="new-password"
              required
              value={confirma}
              onChange={(e) => setConfirma(e.target.value)}
              aria-invalid={diferentes}
              className="h-11 rounded-xl"
            />
            {diferentes && <p className="text-xs text-destructive">As senhas não são iguais.</p>}
          </div>

          <Button
            type="submit"
            disabled={salvando || !podeEnviar}
            className="h-11 w-full rounded-xl font-bold"
          >
            {salvando ? "Salvando..." : "Salvar e entrar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
