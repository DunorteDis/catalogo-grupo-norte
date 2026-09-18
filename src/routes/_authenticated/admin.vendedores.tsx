import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { mensagemErro } from "@/lib/erros";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { slugify, somenteDigitos } from "@/lib/catalogo";

export const Route = createFileRoute("/_authenticated/admin/vendedores")({
  component: VendedoresPage,
});

function VendedoresPage() {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [distribuidoraId, setDistribuidoraId] = useState("");

  const { data: distribuidoras } = useQuery({
    queryKey: ["admin-distribuidoras"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribuidoras")
        .select("id, nome")
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
        .select("id, nome, slug, whatsapp, ativo, distribuidoras(nome)")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      const base = slugify(nome);
      const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
      const { error } = await supabase.from("vendedores").insert({
        nome: nome.trim(),
        slug,
        whatsapp: somenteDigitos(whatsapp),
        distribuidora_id: distribuidoraId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNome("");
      setWhatsapp("");
      qc.invalidateQueries({ queryKey: ["admin-vendedores"] });
      toast.success("Vendedor cadastrado.");
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vendedores").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-vendedores"] }),
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  function copiarLink(slug: string) {
    const url = `${window.location.origin}/c/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Vendedores</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Cada vendedor tem um link próprio. O pedido do cliente vai para o WhatsApp cadastrado aqui.
      </p>

      <form
        className="mt-6 grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-4"
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
          <Label>Distribuidora</Label>
          <select
            value={distribuidoraId}
            onChange={(e) => setDistribuidoraId(e.target.value)}
            required
            className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
          >
            <option value="">Selecione</option>
            {(distribuidoras ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={criar.isPending} className="h-11 w-full rounded-xl font-bold">
            Cadastrar
          </Button>
        </div>
      </form>

      <div className="mt-6 space-y-3">
        {(vendedores ?? []).map((v) => (
          <div key={v.id} className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{v.nome}</p>
              <p className="text-xs text-muted-foreground">
                {(v.distribuidoras as { nome: string } | null)?.nome} · {v.whatsapp} · /c/{v.slug}
              </p>
            </div>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => copiarLink(v.slug)}>
              <Copy className="mr-2 h-4 w-4" />
              Copiar link
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
