"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, ShoppingBag } from "lucide-react";
import { useState } from "react";

import { chamar } from "@/lib/chamar";
import { useMeuVendedor } from "@/hooks/use-meu-vendedor";
import { fimDoDia, inicioDoDia } from "@/lib/periodo";
import { PageHeader } from "@/components/abastex";
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
        <Loader2 className="size-6 animate-spin text-ink-subtle" />
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
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={["Abastex", "Pedidos"]}
        icon={ShoppingBag}
        tone="accent"
        title="Pedidos recebidos"
        subtitle="Tudo que os clientes concluíram pelos seus links. Clique num pedido para ver os itens."
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
      />
    </div>
  );
}
