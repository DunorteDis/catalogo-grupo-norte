"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";

import { chamar } from "@/lib/chamar";
import { mensagemErro } from "@/lib/erros";
import { SENHA_MINIMO, senhaFraca } from "@/lib/acessos";
import { definirSenha } from "@/server/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import logoEscuro from "@/assets/abastex/abastex-logo-dark.png";
import { IconTile } from "@/components/abastex";

export function FormSenha({ usuario }: { usuario: string }) {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [salvando, setSalvando] = useState(false);

  // O freio de tentativas (src/server/freio.ts) trava por usuário+IP no servidor;
  // aqui a defesa é a senha não ser adivinhável. A recusa de verdade também é
  // no servidor (ver definirSenha).
  const problema = senha.length > 0 ? senhaFraca(senha, usuario) : null;
  const diferentes = confirma.length > 0 && senha !== confirma;
  const podeEnviar = senha.length > 0 && !senhaFraca(senha, usuario) && senha === confirma;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!podeEnviar) return;
    setSalvando(true);
    try {
      const destino = await chamar(definirSenha(senha));
      toast.success("Senha definida. Bom trabalho!");
      router.replace(destino);
    } catch (err) {
      toast.error(mensagemErro(err, "Não foi possível definir a senha."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-sidebar px-6 py-12">
      <img src={logoEscuro.src} alt="Abastex" className="h-8 w-auto" />

      <div className="ax-card mt-10 w-full max-w-sm p-6">
        <IconTile icon={KeyRound} tone="brand" size="lg" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Crie sua senha</h1>
        <p className="mt-2 text-ink-muted">
          A senha que você recebeu é provisória e passou por WhatsApp. Escolha uma que só você saiba
          para continuar.
        </p>
        <p className="mt-3 font-mono text-xs text-ink-muted">{usuario}</p>

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
            />
            {diferentes && <p className="text-xs text-destructive">As senhas não são iguais.</p>}
          </div>

          <Button type="submit" disabled={salvando || !podeEnviar} className="w-full">
            {salvando ? "Salvando..." : "Salvar e entrar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
