import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/admin/distribuidoras")({
  component: DistribuidorasPage,
});

function DistribuidorasPage() {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["admin-distribuidoras-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribuidoras")
        .select("id, nome, slug, logo_url, cor, ativo")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const alternar = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("distribuidoras").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-distribuidoras-full"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Distribuidoras</h1>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(data ?? []).map((d) => (
          <div key={d.id} className="rounded-2xl border bg-card p-4">
            <div className="flex h-16 items-center">
              {d.logo_url ? (
                <img src={d.logo_url} alt={d.nome} className="h-full w-auto max-w-[160px] object-contain" />
              ) : (
                <span className="font-extrabold">{d.nome}</span>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="h-4 w-4 rounded-full border" style={{ backgroundColor: d.cor }} />
              <span className="text-xs text-muted-foreground">{d.cor}</span>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs font-semibold">{d.ativo ? "Ativa" : "Inativa"}</span>
                <Switch
                  checked={!!d.ativo}
                  onCheckedChange={(v) => alternar.mutate({ id: d.id, ativo: v })}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
