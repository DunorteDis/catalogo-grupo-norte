"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { chamar } from "@/lib/chamar";
import { useMeuVendedor } from "@/hooks/use-meu-vendedor";
import { fimDoDia, inicioDoDia } from "@/lib/periodo";
import { FiltroPeriodo, periodoInicial } from "@/components/filtro-periodo";
import { ListaPedidos, type PedidoDaLista } from "@/components/lista-pedidos";
import { meusPedidos } from "@/server/pedidos";

export default function MeusPedidosPage() {
  const vendedorQuery = useMeuVendedor();
  const [periodo, setPeriodo] = useState(periodoInicial);

  const inicio = inicioDoDia(periodo.de).toISOString();
  const fim = fimDoDia(periodo.ate).toISOString();

  // O servidor filtra pelo vendedor da sessão, então ninguém enxerga pedido de outro.
  // ponytail: sem paginação — o período já limita o conjunto. Se um vendedor
  // passar a fechar centenas de pedidos por dia, aqui entra paginação.
  const pedidosQuery = useQuery({
    queryKey: ["meus-pedidos", inicio, fim],
    enabled: !!vendedorQuery.data?.id,
    queryFn: () => chamar(meusPedidos(inicio, fim)),
  });

  if (vendedorQuery.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!vendedorQuery.data) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Sua conta ainda não está ligada a um cadastro de vendedor. Fale com o administrador.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-extrabold">Pedidos recebidos</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tudo que os clientes concluíram pelos seus links.
      </p>

      <div className="mt-6">
        <FiltroPeriodo valor={periodo} onChange={setPeriodo} carregando={pedidosQuery.isFetching} />
      </div>

      <ListaPedidos
        pedidos={pedidosQuery.data ?? []}
        carregando={pedidosQuery.isLoading}
        erro={pedidosQuery.error as Error | null}
      />
    </div>
  );
}
