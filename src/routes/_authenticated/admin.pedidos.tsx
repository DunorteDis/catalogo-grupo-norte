import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { fimDoDia, inicioDoDia } from "@/lib/periodo";
import { FiltroPeriodo, periodoInicial } from "@/components/filtro-periodo";
import { ListaPedidos, type PedidoDaLista } from "@/components/lista-pedidos";

export const Route = createFileRoute("/_authenticated/admin/pedidos")({
  component: PedidosPage,
});

function PedidosPage() {
  const [periodo, setPeriodo] = useState(periodoInicial);

  const inicio = inicioDoDia(periodo.de).toISOString();
  const fim = fimDoDia(periodo.ate).toISOString();

  // Admin enxerga de todos os vendedores — pela policy "admin le pedidos".
  // Os itens vêm aninhados: antes era uma consulta extra a cada pedido aberto.
  const pedidosQuery = useQuery({
    queryKey: ["admin-pedidos", inicio, fim],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select(
          "id, cliente_nome, observacao, total_itens, created_at, vendedores(nome), distribuidoras(nome), pedido_itens(codigo, nome, quantidade)",
        )
        .gte("created_at", inicio)
        .lte("created_at", fim)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Pedidos</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tudo que os clientes concluíram pelos links dos vendedores.
      </p>

      <div className="mt-6">
        <FiltroPeriodo valor={periodo} onChange={setPeriodo} carregando={pedidosQuery.isFetching} />
      </div>

      <ListaPedidos
        pedidos={(pedidosQuery.data ?? []) as PedidoDaLista[]}
        carregando={pedidosQuery.isLoading}
        erro={pedidosQuery.error as Error | null}
        mostrarVendedor
      />
    </div>
  );
}
