import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { mensagemErro } from "@/lib/erros";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { fotoUrl } from "@/lib/catalogo";

export const Route = createFileRoute("/_authenticated/admin/produtos")({
  component: ProdutosPage,
});

const PAGE = 30;

function ProdutosPage() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  const [pagina, setPagina] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setTermo(busca.trim());
      setPagina(0);
    }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  const { data } = useQuery({
    queryKey: ["admin-produtos", termo, pagina],
    queryFn: async () => {
      let q = supabase
        .from("produtos")
        .select("id, codigo, nome, arquivo, ativo", { count: "exact" })
        .order("nome")
        .range(pagina * PAGE, pagina * PAGE + PAGE - 1);
      if (termo) q = q.or(`nome.ilike.%${termo}%,codigo.ilike.%${termo}%`);
      const { data, error, count } = await q;
      if (error) throw error;
      return { linhas: data ?? [], total: count ?? 0 };
    },
  });

  const alternar = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("produtos").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-produtos"] }),
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Produtos</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {data?.total ?? 0} produtos cadastrados. Desative os que não devem aparecer no catálogo.
      </p>

      <Input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por nome ou código"
        className="mt-4 h-11 max-w-md rounded-xl"
      />

      <div className="mt-4 divide-y rounded-2xl border bg-card">
        {(data?.linhas ?? []).map((p) => (
          <div key={p.id} className="flex items-center gap-3 p-3">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted/40">
              {fotoUrl(p.arquivo) && (
                <img src={fotoUrl(p.arquivo)!} alt={p.nome} className="h-full w-full object-contain" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{p.nome}</p>
              <p className="text-xs text-muted-foreground">Cód. {p.codigo}</p>
            </div>
            <Switch
              checked={!!p.ativo}
              onCheckedChange={(v) => alternar.mutate({ id: p.id, ativo: v })}
            />
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Button
          variant="outline"
          disabled={pagina === 0}
          onClick={() => setPagina((p) => Math.max(0, p - 1))}
        >
          Anterior
        </Button>
        <span className="text-xs text-muted-foreground">Página {pagina + 1}</span>
        <Button
          variant="outline"
          disabled={(data?.linhas.length ?? 0) < PAGE}
          onClick={() => setPagina((p) => p + 1)}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}
