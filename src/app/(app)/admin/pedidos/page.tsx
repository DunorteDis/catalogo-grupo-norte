"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ShoppingBag } from "lucide-react";

import { chamar } from "@/lib/chamar";
import { fimDoDia, inicioDoDia } from "@/lib/periodo";
import { PageHeader } from "@/components/abastex";
import { FiltroPeriodo, periodoInicial } from "@/components/filtro-periodo";
import { ListaPedidos } from "@/components/lista-pedidos";
import { pedidosDoPeriodo } from "@/server/pedidos";

export default function PedidosPage() {
  const [periodo, setPeriodo] = useState(periodoInicial);

  const inicio = inicioDoDia(periodo.de).toISOString();
  const fim = fimDoDia(periodo.ate).toISOString();

  // Admin enxerga de todos os vendedores; itens vêm aninhados numa consulta só.
  const pedidosQuery = useQuery({
    queryKey: ["admin-pedidos", inicio, fim],
    queryFn: () => chamar(pedidosDoPeriodo(inicio, fim)),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={["Abastex", "Pedidos"]}
        icon={ShoppingBag}
        tone="accent"
        title="Pedidos"
        subtitle="Tudo que os clientes concluíram pelos links dos vendedores. Clique num pedido para ver os itens."
        actions={
          <FiltroPeriodo
            valor={periodo}
            onChange={setPeriodo}
            carregando={pedidosQuery.isFetching}
          />
        }
      />

      <ListaPedidos
        pedidos={pedidosQuery.data ?? []}
        carregando={pedidosQuery.isLoading}
        erro={pedidosQuery.error as Error | null}
        mostrarVendedor
      />
    </div>
  );
}
