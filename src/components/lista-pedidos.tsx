import Link from "next/link";
import { useState } from "react";
import { ChevronRight, ShoppingBag, ShoppingCart, TriangleAlert, User, Users } from "lucide-react";

import { paginaValida, POR_PAGINA } from "@/lib/catalogo";
import { formatarData } from "@/lib/periodo";
import { cn } from "@/lib/utils";
import { codigoPedido } from "@/lib/whatsapp";
import { Badge, IconTile, KpiCard } from "@/components/abastex";
import { Paginacao } from "@/components/paginacao";

export type PedidoDaLista = {
  id: string;
  cliente_nome: string | null;
  observacao: string | null;
  total_itens: number;
  created_at: string;
  distribuidoras: { nome: string; cor: string } | null;
  vendedores?: { nome: string } | null;
  /** Cliente do Winthor ligado ao pedido; null enquanto ninguém identificou. */
  cliente: { codcli: number; nome: string; cnpj: string | null } | null;
  pedido_itens: {
    id: string;
    /** EAN do produto, ou o codprod quando ele não tem EAN. */
    codigo: string;
    /** Código do produto no Winthor; nulo quando o item não achou o produto. */
    codprod: number | null;
    nome: string;
    quantidade: number;
    unidade: string;
  }[];
  /** Conversa do WhatsApp em que o pedido chegou (pelo código "Pedido #..." da mensagem). */
  conversa_id?: string | null;
};

const num = (n: number) => n.toLocaleString("pt-BR");

/** Números do período e a lista; cada pedido abre a tela dele em `${base}/<id>`. */
export function ListaPedidos({
  pedidos,
  base,
  carregando,
  erro,
  mostrarVendedor = false,
}: {
  pedidos: PedidoDaLista[];
  /** Caminho da tela de pedidos: /admin/pedidos ou /meus-pedidos. */
  base: string;
  carregando?: boolean;
  erro?: Error | null;
  /** Na visão do admin os pedidos vêm de vendedores diferentes. */
  mostrarVendedor?: boolean;
}) {
  // O período inteiro vem de uma vez: os números do topo somam tudo, a lista pagina.
  const [pagina, setPagina] = useState(0);
  // Outro período é outra lista: volta para a primeira página. Assinatura primitiva
  // porque o pai passa `data ?? []`, um array novo a cada render enquanto carrega.
  const assinatura = `${pedidos.length}:${pedidos[0]?.id ?? ""}`;
  const [anterior, setAnterior] = useState(assinatura);
  if (anterior !== assinatura) {
    setAnterior(assinatura);
    setPagina(0);
  }
  const inicio = paginaValida(pagina, pedidos.length) * POR_PAGINA;
  const visiveis = pedidos.slice(inicio, inicio + POR_PAGINA);

  const itens = pedidos.reduce((s, p) => s + (p.total_itens ?? 0), 0);
  // Identificado = ligado a um cliente do Winthor, não o nome digitado no catálogo.
  const clientes = new Set(pedidos.flatMap((p) => (p.cliente ? [p.cliente.codcli] : []))).size;
  const vendedores = new Set(pedidos.map((p) => p.vendedores?.nome).filter(Boolean)).size;

  return (
    <>
      {/* classes literais: o Tailwind não enxerga nome de classe montado em runtime */}
      <div
        className={cn(
          "grid grid-cols-2 gap-3 sm:gap-4",
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
        <ul className="flex flex-col gap-2">
          {visiveis.map((pedido) => {
            // O nome do Winthor vale mais que o digitado no catálogo.
            const cliente = pedido.cliente?.nome ?? pedido.cliente_nome?.trim();
            return (
              <li key={pedido.id}>
                <Link
                  href={`${base}/${pedido.id}`}
                  className="group flex w-full items-center gap-4 rounded-2xl border bg-card px-4 py-3 shadow-card transition-colors hover:border-brand hover:bg-surface-hover"
                >
                  <IconTile
                    icon={cliente ? User : ShoppingBag}
                    tone={cliente ? "accent" : "brand"}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-2">
                      {/* O mesmo código que vai na mensagem do WhatsApp ("Novo pedido #..."). */}
                      <code className="shrink-0 font-mono text-xs font-semibold text-brand">
                        #{codigoPedido(pedido.id)}
                      </code>
                      <span
                        className={cn(
                          "truncate",
                          cliente ? "font-semibold" : "font-medium italic text-ink-muted",
                        )}
                      >
                        {cliente || "Cliente não identificado"}
                      </span>
                      {!pedido.cliente && (
                        <span className="w-fit shrink-0 rounded-full bg-warning-soft px-2 text-[0.6875rem] font-semibold text-warning">
                          sem cliente
                        </span>
                      )}
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
                  <ChevronRight className="size-4.5 shrink-0 text-ink-subtle transition group-hover:translate-x-0.5 group-hover:text-brand" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Paginacao pagina={pagina} total={pedidos.length} onMudar={setPagina} />
    </>
  );
}
