import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { mensagemErro } from "@/lib/erros";
import {
  alterarSenhaUsuario,
  criarUsuario,
  excluirUsuario,
  listarUsuarios,
} from "@/lib/usuarios.functions";

export const Route = createFileRoute("/_authenticated/admin/usuarios")({
  component: UsuariosPage,
});

function UsuariosPage() {
  const qc = useQueryClient();
  const listar = useServerFn(listarUsuarios);
  const criar = useServerFn(criarUsuario);
  const excluir = useServerFn(excluirUsuario);
  const alterarSenha = useServerFn(alterarSenhaUsuario);

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [admin, setAdmin] = useState(true);

  const { data: usuarios, isLoading } = useQuery({
    queryKey: ["usuarios"],
    queryFn: () => listar(),
  });

  const criarMut = useMutation({
    mutationFn: () => criar({ data: { email: email.trim(), senha, admin } }),
    onSuccess: () => {
      setEmail("");
      setSenha("");
      toast.success("Usuário criado. Ele já pode entrar com esse e-mail e senha.");
      qc.invalidateQueries({ queryKey: ["usuarios"] });
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const excluirMut = useMutation({
    mutationFn: (id: string) => excluir({ data: { id } }),
    onSuccess: () => {
      toast.success("Usuário excluído.");
      qc.invalidateQueries({ queryKey: ["usuarios"] });
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const senhaMut = useMutation({
    mutationFn: (v: { id: string; senha: string }) => alterarSenha({ data: v }),
    onSuccess: () => toast.success("Senha alterada."),
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Usuários</h1>
        <p className="text-sm text-muted-foreground">
          Somente administradores criam acessos. Não há cadastro aberto nem confirmação por e-mail.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          criarMut.mutate();
        }}
        className="grid gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
      >
        <div className="space-y-1.5">
          <Label htmlFor="novo-email">E-mail</Label>
          <Input
            id="novo-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nova-senha">Senha</Label>
          <Input
            id="nova-senha"
            type="text"
            required
            minLength={8}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Mínimo 8 caracteres"
            className="h-11 rounded-xl"
          />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Switch id="admin" checked={admin} onCheckedChange={setAdmin} />
          <Label htmlFor="admin" className="text-sm">
            Administrador
          </Label>
        </div>
        <Button
          type="submit"
          disabled={criarMut.isPending}
          className="h-11 rounded-xl font-bold"
        >
          {criarMut.isPending ? "Criando..." : "Criar usuário"}
        </Button>
      </form>

      <div className="overflow-hidden rounded-2xl border bg-card">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <ul className="divide-y">
            {(usuarios ?? []).map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{u.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {u.admin ? "Administrador" : "Usuário"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const nova = window.prompt("Nova senha (mínimo 8 caracteres):");
                    if (nova) senhaMut.mutate({ id: u.id, senha: nova });
                  }}
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  Senha
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (window.confirm(`Excluir o usuário ${u.email}?`)) excluirMut.mutate(u.id);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
