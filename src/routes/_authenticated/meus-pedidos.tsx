import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useMeuVendedor } from "@/hooks/use-meu-vendedor";
import { fimDoDia, inicioDoDia } from "@/lib/periodo";
import { FiltroPeriodo, periodoInicial } from "@/components/filtro-periodo";
import { ListaPedidos, type PedidoDaLista } from "@/components/lista-pedidos";

export const Route = createFileRoute("/_authenticated/meus-pedidos")({
  component: MeusPedidosPage,
});

function MeusPedidosPage() {
  const { user } = Route.useRouteContext();
  const vendedorQuery = useMeuVendedor(user.id);
  const [periodo, setPeriodo] = useState(periodoInicial);

  const inicio = inicioDoDia(periodo.de).toISOString();
  const fim = fimDoDia(periodo.ate).toISOString();

  // Depende da policy "vendedor le proprios pedidos": o banco filtra por
  // vendedores.user_id = auth.uid(), então ninguém enxerga pedido de outro.
  // ponytail: sem paginação — o período já limita o conjunto. Se um vendedor
  // passar a fechar centenas de pedidos por dia, aqui entra paginação.
  const pedidosQuery = useQuery({
    queryKey: ["meus-pedidos", vendedorQuery.data?.id, inicio, fim],
    enabled: !!vendedorQuery.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select(
          "id, cliente_nome, observacao, total_itens, created_at, distribuidoras(nome), pedido_itens(codigo, nome, quantidade, unidade)",
        )
        .eq("vendedor_id", vendedorQuery.data!.id)
        .gte("created_at", inicio)
        .lte("created_at", fim)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
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
        pedidos={(pedidosQuery.data ?? []) as PedidoDaLista[]}
        carregando={pedidosQuery.isLoading}
        erro={pedidosQuery.error as Error | null}
      />
    </div>
  );
}
