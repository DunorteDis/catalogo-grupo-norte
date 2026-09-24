"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { chamar } from "@/lib/chamar";
import { fimDoDia, inicioDoDia } from "@/lib/periodo";
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
    <div>
      <h1 className="text-2xl font-extrabold">Pedidos</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tudo que os clientes concluíram pelos links dos vendedores.
      </p>

      <div className="mt-6">
        <FiltroPeriodo valor={periodo} onChange={setPeriodo} carregando={pedidosQuery.isFetching} />
      </div>

      <ListaPedidos
        pedidos={pedidosQuery.data ?? []}
        carregando={pedidosQuery.isLoading}
        erro={pedidosQuery.error as Error | null}
        mostrarVendedor
      />
    </div>
  );
}
