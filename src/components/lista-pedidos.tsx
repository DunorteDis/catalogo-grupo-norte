import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { fotoUrl, qtdComUnidade } from "@/lib/catalogo";
import { formatarData } from "@/lib/periodo";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export type PedidoDaLista = {
  id: string;
  cliente_nome: string | null;
  observacao: string | null;
  total_itens: number;
  created_at: string;
  distribuidoras: { nome: string } | null;
  vendedores?: { nome: string } | null;
  pedido_itens: { codigo: string; nome: string; quantidade: number; unidade: string }[];
};

function Kpi({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </p>
      <p className="mt-1.5 text-3xl font-extrabold tabular-nums">{valor}</p>
    </div>
  );
}

export function ListaPedidos({
  pedidos,
  carregando,
  erro,
  mostrarVendedor = false,
}: {
  pedidos: PedidoDaLista[];
  carregando?: boolean;
  erro?: Error | null;
  /** Na visão do admin os pedidos vêm de vendedores diferentes. */
  mostrarVendedor?: boolean;
}) {
  // pedido_itens guarda só codigo/nome/quantidade, então a foto vem de produtos.
  // Não há FK entre as duas (de propósito: apagar um produto não pode derrubar
  // histórico de pedido), por isso o casamento é por código numa consulta à parte.
  const codigos = [...new Set(pedidos.flatMap((p) => p.pedido_itens.map((i) => i.codigo)))].sort();

  const fotosQuery = useQuery({
    queryKey: ["fotos-de-produtos", codigos],
    enabled: codigos.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("codigo, arquivo")
        .in("codigo", codigos);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((p) => [p.codigo, p.arquivo]));
    },
  });

  const itens = pedidos.reduce((s, p) => s + (p.total_itens ?? 0), 0);
  const clientes = new Set(pedidos.map((p) => p.cliente_nome?.trim().toLowerCase()).filter(Boolean))
    .size;
  const vendedores = new Set(pedidos.map((p) => p.vendedores?.nome).filter(Boolean)).size;

  return (
    <>
      {/* classes literais: o Tailwind não enxerga nome de classe montado em runtime */}
      <div className={cn("mt-3 grid gap-3", mostrarVendedor ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
        <Kpi rotulo="Pedidos" valor={pedidos.length} />
        <Kpi rotulo="Itens pedidos" valor={itens} />
        <Kpi rotulo="Clientes" valor={clientes} />
        {mostrarVendedor && <Kpi rotulo="Vendedores" valor={vendedores} />}
      </div>

      {erro && (
        <div className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm font-bold text-destructive">
            Não foi possível carregar os pedidos.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{erro.message}</p>
        </div>
      )}

      {!carregando && !erro && pedidos.length === 0 && (
        <p className="mt-6 rounded-2xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          Nenhum pedido nesse período. Experimente ampliar as datas.
        </p>
      )}

      {pedidos.length > 0 && (
        <Accordion type="single" collapsible className="mt-6 space-y-2">
          {pedidos.map((pedido) => (
            <AccordionItem
              key={pedido.id}
              value={pedido.id}
              className="rounded-2xl border bg-card px-4"
            >
              <AccordionTrigger className="hover:no-underline">
                <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 pr-2 text-left">
                  <span className="text-sm font-bold">
                    {pedido.cliente_nome?.trim() || "Cliente não identificado"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {[
                      mostrarVendedor ? pedido.vendedores?.nome : null,
                      pedido.distribuidoras?.nome,
                      formatarData(pedido.created_at),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="ml-auto shrink-0 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-bold text-primary">
                    {pedido.total_itens} {pedido.total_itens === 1 ? "item" : "itens"}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="divide-y border-t">
                  {pedido.pedido_itens.map((item, idx) => {
                    const foto = fotoUrl(fotosQuery.data?.[item.codigo]);
                    return (
                      <li key={idx} className="flex items-center gap-3 py-3">
                        <div className="size-14 shrink-0 overflow-hidden rounded-lg border bg-muted/40">
                          {foto && (
                            <img
                              src={foto}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-contain"
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-snug">{item.nome}</p>
                          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                            {item.codigo}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-lg bg-muted px-2.5 py-1 text-sm font-bold">
                          {qtdComUnidade(item.quantidade, item.unidade)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {pedido.observacao && (
                  <p className="border-t pt-3 text-sm text-muted-foreground">
                    <span className="font-semibold">Observação:</span> {pedido.observacao}
                  </p>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </>
  );
}
