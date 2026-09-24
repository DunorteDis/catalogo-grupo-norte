import { useQuery } from "@tanstack/react-query";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import {
  ChevronDown,
  Package,
  ShoppingBag,
  ShoppingCart,
  TriangleAlert,
  User,
  Users,
} from "lucide-react";

import { chamar } from "@/lib/chamar";
import { fotoUrl, qtdComUnidade } from "@/lib/catalogo";
import { formatarData } from "@/lib/periodo";
import { cn } from "@/lib/utils";
import { Badge, IconTile, KpiCard } from "@/components/abastex";
import { fotosPorCodigo } from "@/server/pedidos";

export type PedidoDaLista = {
  id: string;
  cliente_nome: string | null;
  observacao: string | null;
  total_itens: number;
  created_at: string;
  distribuidoras: { nome: string; cor: string } | null;
  vendedores?: { nome: string } | null;
  pedido_itens: { codigo: string; nome: string; quantidade: number; unidade: string }[];
};

const num = (n: number) => n.toLocaleString("pt-BR");

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
    queryFn: () => chamar(fotosPorCodigo(codigos)),
  });

  const itens = pedidos.reduce((s, p) => s + (p.total_itens ?? 0), 0);
  const clientes = new Set(pedidos.map((p) => p.cliente_nome?.trim().toLowerCase()).filter(Boolean))
    .size;
  const vendedores = new Set(pedidos.map((p) => p.vendedores?.nome).filter(Boolean)).size;

  return (
    <>
      {/* classes literais: o Tailwind não enxerga nome de classe montado em runtime */}
      <div
        className={cn(
          "grid gap-4 sm:grid-cols-2",
          mostrarVendedor ? "lg:grid-cols-4" : "lg:grid-cols-3",
        )}
      >
        <KpiCard label="Pedidos" value={num(pedidos.length)} icon={ShoppingBag} tone="accent" />
        <KpiCard label="Itens pedidos" value={num(itens)} icon={ShoppingCart} tone="info" />
        <KpiCard
          label="Clientes"
          value={num(clientes)}
          suffix="identificados"
          icon={User}
          tone="rose"
        />
        {mostrarVendedor && (
          <KpiCard label="Vendedores" value={num(vendedores)} icon={Users} tone="brand" />
        )}
      </div>

      {erro && (
        <div className="rounded-2xl border border-danger/30 bg-danger-soft p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-danger">
            <TriangleAlert className="size-4" />
            Não foi possível carregar os pedidos.
          </p>
          <p className="mt-1 text-xs text-ink-muted">{erro.message}</p>
        </div>
      )}

      {!carregando && !erro && pedidos.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line-strong p-12 text-center text-sm text-ink-muted">
          Nenhum pedido nesse período. Experimente ampliar as datas.
        </p>
      )}

      {pedidos.length > 0 && (
        <AccordionPrimitive.Root type="single" collapsible className="flex flex-col gap-2">
          {pedidos.map((pedido) => {
            const cliente = pedido.cliente_nome?.trim();
            return (
              <AccordionPrimitive.Item
                key={pedido.id}
                value={pedido.id}
                className="group overflow-hidden rounded-2xl border bg-card shadow-card data-[state=open]:border-brand"
              >
                <AccordionPrimitive.Header>
                  <AccordionPrimitive.Trigger className="flex w-full cursor-pointer items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-surface-hover">
                    <IconTile
                      icon={cliente ? User : ShoppingBag}
                      tone={cliente ? "accent" : "brand"}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate",
                          cliente ? "font-semibold" : "font-medium italic text-ink-muted",
                        )}
                      >
                        {cliente || "Cliente não identificado"}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
                        {mostrarVendedor && pedido.vendedores?.nome && (
                          <>
                            <span>{pedido.vendedores.nome}</span>
                            <span aria-hidden>·</span>
                          </>
                        )}
                        {pedido.distribuidoras && (
                          <>
                            <span className="inline-flex items-center gap-1.5">
                              <i
                                className="inline-block size-2 rounded-full"
                                style={{ background: pedido.distribuidoras.cor }}
                              />
                              {pedido.distribuidoras.nome}
                            </span>
                            <span aria-hidden>·</span>
                          </>
                        )}
                        <span>{formatarData(pedido.created_at)}</span>
                      </p>
                    </div>
                    <Badge tone="brand">
                      {num(pedido.total_itens)} {pedido.total_itens === 1 ? "item" : "itens"}
                    </Badge>
                    <ChevronDown className="size-[18px] shrink-0 text-ink-subtle transition-transform duration-150 group-data-[state=open]:rotate-180 group-data-[state=open]:text-brand" />
                  </AccordionPrimitive.Trigger>
                </AccordionPrimitive.Header>
                <AccordionPrimitive.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                  <div className="border-t bg-surface-sunken px-4 pb-3 pt-1 sm:pl-[68px]">
                    <ul className="divide-y divide-dashed">
                      {pedido.pedido_itens.map((item, idx) => {
                        const foto = fotoUrl(fotosQuery.data?.[item.codigo]);
                        return (
                          <li key={idx} className="flex items-center gap-3 py-2.5">
                            <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-sm bg-card text-ink-subtle">
                              {foto ? (
                                <img
                                  src={foto}
                                  alt=""
                                  loading="lazy"
                                  className="h-full w-full object-contain"
                                />
                              ) : (
                                <Package size={20} aria-hidden />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-medium leading-snug">{item.nome}</p>
                              <p className="mt-0.5 font-mono text-xs text-ink-muted">
                                {item.codigo}
                              </p>
                            </div>
                            <b className="shrink-0 text-[13px] tabular-nums">
                              {qtdComUnidade(item.quantidade, item.unidade)}
                            </b>
                          </li>
                        );
                      })}
                    </ul>
                    {pedido.observacao && (
                      <p className="border-t border-dashed pt-3 text-[13px] text-ink-muted">
                        <span className="font-semibold text-ink">Observação:</span>{" "}
                        {pedido.observacao}
                      </p>
                    )}
                  </div>
                </AccordionPrimitive.Content>
              </AccordionPrimitive.Item>
            );
          })}
        </AccordionPrimitive.Root>
      )}
    </>
  );
}
