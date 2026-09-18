import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/pedidos")({
  component: PedidosPage,
});

function PedidosPage() {
  const [aberto, setAberto] = useState<string | null>(null);

  const { data: pedidos } = useQuery({
    queryKey: ["admin-pedidos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select(
          "id, created_at, cliente_nome, observacao, total_itens, vendedores(nome), distribuidoras(nome)",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const { data: itens } = useQuery({
    queryKey: ["admin-pedido-itens", aberto],
    enabled: !!aberto,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedido_itens")
        .select("id, codigo, nome, quantidade")
        .eq("pedido_id", aberto!);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Pedidos</h1>
      <div className="mt-6 space-y-3">
        {(pedidos ?? []).map((p) => (
          <div key={p.id} className="rounded-2xl border bg-card p-4">
            <button
              className="flex w-full items-center gap-3 text-left"
              onClick={() => setAberto(aberto === p.id ? null : p.id)}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">
                  {p.cliente_nome || "Cliente não informado"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(p.created_at as string).toLocaleString("pt-BR")} ·{" "}
                  {(p.vendedores as { nome: string } | null)?.nome} ·{" "}
                  {(p.distribuidoras as { nome: string } | null)?.nome}
                </p>
              </div>
              <span className="rounded-lg bg-muted px-2 py-1 text-xs font-bold">
                {p.total_itens} itens
              </span>
            </button>
            {aberto === p.id && (
              <div className="mt-3 border-t pt-3">
                {p.observacao && (
                  <p className="mb-2 text-xs text-muted-foreground">Obs.: {p.observacao}</p>
                )}
                <ul className="space-y-1">
                  {(itens ?? []).map((i) => (
                    <li key={i.id} className="flex justify-between gap-3 text-xs">
                      <span className="min-w-0 flex-1 truncate">
                        {i.codigo} — {i.nome}
                      </span>
                      <span className="font-bold">{i.quantidade}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
        {pedidos?.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">Nenhum pedido ainda.</p>
        )}
      </div>
    </div>
  );
}
