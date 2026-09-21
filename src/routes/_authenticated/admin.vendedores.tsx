import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Copy, KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { mensagemErro } from "@/lib/erros";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  alterarSenhaVendedor,
  criarVendedor,
  excluirVendedor,
} from "@/lib/vendedores.functions";

export const Route = createFileRoute("/_authenticated/admin/vendedores")({
  component: VendedoresPage,
});

function VendedoresPage() {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");

  const criarFn = useServerFn(criarVendedor);
  const excluirFn = useServerFn(excluirVendedor);
  const senhaFn = useServerFn(alterarSenhaVendedor);

  const { data: distribuidoras } = useQuery({
    queryKey: ["admin-distribuidoras"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribuidoras")
        .select("id, nome, slug")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: vendedores } = useQuery({
    queryKey: ["admin-vendedores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendedores")
        .select("id, nome, slug, whatsapp, ativo")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const criar = useMutation({
    mutationFn: async () =>
      criarFn({ data: { nome, whatsapp, email: email.trim(), senha } }),
    onSuccess: () => {
      setNome("");
      setWhatsapp("");
      setEmail("");
      setSenha("");
      qc.invalidateQueries({ queryKey: ["admin-vendedores"] });
      toast.success("Vendedor cadastrado com acesso ao sistema.");
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => excluirFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-vendedores"] }),
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const trocarSenha = useMutation({
    mutationFn: async (vars: { id: string; senha: string }) => senhaFn({ data: vars }),
    onSuccess: () => toast.success("Senha alterada."),
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  function copiarLink(slug: string, distribuidoraSlug: string, nomeDist: string) {
    const url = `${window.location.origin}/c/${slug}/${distribuidoraSlug}`;
    navigator.clipboard.writeText(url);
    toast.success(`Link do catálogo ${nomeDist} copiado!`);
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Vendedores</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Cada vendedor tem acesso próprio ao sistema e pode copiar o link do catálogo de qualquer
        distribuidora. O pedido do cliente vai para o WhatsApp cadastrado aqui.
      </p>

      <form
        className="mt-6 grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          criar.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label>Nome</Label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} required className="h-11 rounded-xl" />
        </div>
        <div className="space-y-1.5">
          <Label>WhatsApp (com DDD)</Label>
          <Input
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            required
            placeholder="92991234567"
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-1.5">
          <Label>E-mail de acesso</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Senha</Label>
          <Input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
            minLength={8}
            className="h-11 rounded-xl"
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={criar.isPending} className="h-11 w-full rounded-xl font-bold">
            Cadastrar
          </Button>
        </div>
      </form>

      <div className="mt-6 space-y-3">
        {(vendedores ?? []).map((v) => (
          <div key={v.id} className="rounded-2xl border bg-card p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{v.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {v.whatsapp} · /c/{v.slug}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl"
                onClick={() => {
                  const nova = window.prompt("Nova senha (mínimo 8 caracteres)");
                  if (nova) trocarSenha.mutate({ id: v.id, senha: nova });
                }}
              >
                <KeyRound className="mr-2 h-4 w-4" />
                Senha
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive"
                onClick={() => remover.mutate(v.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
              {(distribuidoras ?? []).map((d) => (
                <Button
                  key={d.id}
                  size="sm"
                  variant="secondary"
                  className="rounded-xl"
                  onClick={() => copiarLink(v.slug, d.slug, d.nome)}
                >
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  {d.nome}
                </Button>
              ))}
            </div>
          </div>
        ))}
        {vendedores?.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Nenhum vendedor cadastrado ainda.
          </p>
        )}
      </div>
    </div>
  );
}
