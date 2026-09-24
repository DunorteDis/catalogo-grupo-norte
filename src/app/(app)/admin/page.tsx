"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  LayoutDashboard,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";

import { chamar } from "@/lib/chamar";
import { fimDoDia, inicioDoDia, paraInput } from "@/lib/periodo";
import { Badge, BarList, Card, Chip, KpiCard, PageHeader } from "@/components/abastex";
import { FiltroPeriodo, periodoInicial } from "@/components/filtro-periodo";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { resumoPainel, vendedoresAtivos } from "@/server/pedidos";

function variacao(atual: number, anterior: number) {
  if (anterior === 0) return atual === 0 ? 0 : null; // null = sem base de comparação
  return Math.round(((atual - anterior) / anterior) * 100);
}

/** Comparação do KPI no formato do DS: seta e cor só quando há base. */
function comparar(atual: number, anterior: number) {
  const d = variacao(atual, anterior);
  if (d == null) return { text: "sem base anterior" };
  return {
    direction: d > 0 ? ("up" as const) : d < 0 ? ("down" as const) : ("flat" as const),
    text: `${d > 0 ? "+" : ""}${d}% vs período anterior`,
  };
}

const num = (n: number) => n.toLocaleString("pt-BR");

function Aviso({ children }: { children: React.ReactNode }) {
  return <p className="py-16 text-center text-sm text-ink-muted">{children}</p>;
}

export default function AdminHome() {
  // Painel abre em 30 dias: um dashboard é sobre tendência, não sobre o dia.
  const [periodo, setPeriodo] = useState(() => periodoInicial("30dias"));

  const inicio = inicioDoDia(periodo.de);
  const fim = fimDoDia(periodo.ate);
  const dias = Math.max(1, Math.round((fim.getTime() - inicio.getTime()) / 86_400_000));
  // Período anterior de mesmo tamanho, imediatamente antes.
  const inicioAnterior = new Date(inicio.getTime() - dias * 86_400_000);

  const pedidosQuery = useQuery({
    queryKey: ["painel-pedidos", inicio.toISOString(), fim.toISOString()],
    queryFn: () => chamar(resumoPainel(inicioAnterior.toISOString(), fim.toISOString())),
  });

  const vendedoresQuery = useQuery({
    queryKey: ["painel-vendedores"],
    queryFn: () => chamar(vendedoresAtivos()),
  });

  const todos = pedidosQuery.data ?? [];
  const noPeriodo = todos.filter((p) => new Date(p.created_at) >= inicio);
  const anteriores = todos.filter((p) => new Date(p.created_at) < inicio);

  const itens = noPeriodo.reduce((s, p) => s + (p.total_itens ?? 0), 0);
  const itensAnt = anteriores.reduce((s, p) => s + (p.total_itens ?? 0), 0);
  const comPedido = new Set(noPeriodo.map((p) => p.vendedor_id).filter(Boolean));
  const comPedidoAnt = new Set(anteriores.map((p) => p.vendedor_id).filter(Boolean));
  const media = noPeriodo.length ? itens / noPeriodo.length : 0;
  const mediaAnt = anteriores.length ? itensAnt / anteriores.length : 0;

  // uma barra por dia do período, inclusive os dias sem pedido — o zero é informação
  const porDia: { dia: string; rotulo: string; pedidos: number }[] = [];
  for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
    const iso = paraInput(d);
    porDia.push({
      dia: iso,
      rotulo: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
      pedidos: 0,
    });
  }
  const indice = new Map(porDia.map((x, i) => [x.dia, i]));
  for (const p of noPeriodo) {
    const i = indice.get(paraInput(new Date(p.created_at)));
    if (i !== undefined) porDia[i]!.pedidos++;
  }
  const pico = Math.max(0, ...porDia.map((d) => d.pedidos));

  const porVendedor = new Map<string, { nome: string; pedidos: number; itens: number }>();
  for (const p of noPeriodo) {
    const nome = p.vendedores?.nome ?? "Sem vendedor";
    const atual = porVendedor.get(nome) ?? { nome, pedidos: 0, itens: 0 };
    atual.pedidos++;
    atual.itens += p.total_itens ?? 0;
    porVendedor.set(nome, atual);
  }
  const ranking = [...porVendedor.values()].sort((a, b) => b.pedidos - a.pedidos).slice(0, 8);
  const ativos = vendedoresQuery.data?.length ?? 0;
  const semPedido = (vendedoresQuery.data ?? []).filter((v) => !comPedido.has(v.id));

  const carregando = pedidosQuery.isLoading;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={["Abastex", "Visão geral"]}
        icon={LayoutDashboard}
        tone="brand"
        title="Visão geral"
        subtitle="Como andam os pedidos e a equipe. Sem valores — o sistema não registra preço."
        actions={
          <FiltroPeriodo
            valor={periodo}
            onChange={setPeriodo}
            carregando={pedidosQuery.isFetching}
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Pedidos"
          value={num(noPeriodo.length)}
          icon={ShoppingBag}
          tone="accent"
          delta={comparar(noPeriodo.length, anteriores.length)}
        />
        <KpiCard
          label="Itens pedidos"
          value={num(itens)}
          icon={ShoppingCart}
          tone="info"
          delta={comparar(itens, itensAnt)}
        />
        <KpiCard
          label="Vendedores com pedido"
          value={num(comPedido.size)}
          suffix={`de ${num(ativos)}`}
          icon={Users}
          tone="brand"
          delta={comparar(comPedido.size, comPedidoAnt.size)}
        />
        <KpiCard
          label="Itens por pedido"
          value={media.toLocaleString("pt-BR", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}
          icon={TrendingUp}
          tone="warning"
          delta={comparar(Math.round(media * 10), Math.round(mediaAnt * 10))}
        />
      </div>

      {pedidosQuery.error && (
        <div className="rounded-2xl border border-danger/30 bg-danger-soft p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-danger">
            <TriangleAlert className="size-4" />
            Não foi possível carregar o painel.
          </p>
          <p className="mt-1 text-xs text-ink-muted">{(pedidosQuery.error as Error).message}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Card
          title="Pedidos por dia"
          subtitle="Dias sem pedido aparecem como zero. O dia de pico fica em verde."
        >
          {carregando ? (
            <Aviso>Carregando...</Aviso>
          ) : noPeriodo.length === 0 ? (
            <Aviso>Nenhum pedido no período.</Aviso>
          ) : (
            <ChartContainer
              config={{ pedidos: { label: "Pedidos", color: "var(--chart-1)" } }}
              className="h-56 w-full [&_.recharts-cartesian-axis-tick_text]:fill-ink-subtle"
            >
              <BarChart data={porDia} margin={{ left: -20, right: 4, top: 20 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis
                  dataKey="rotulo"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  fontSize={11}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={44}
                  fontSize={11}
                />
                <ChartTooltip content={<ChartTooltipContent />} cursor={false} />
                <Bar dataKey="pedidos" radius={[4, 4, 0, 0]} maxBarSize={28}>
                  {porDia.map((d) => (
                    <Cell
                      key={d.dia}
                      fill={d.pedidos === pico ? "var(--accent)" : "var(--chart-1)"}
                    />
                  ))}
                  {/* valor em cima da barra; o zero fica sem rótulo para não virar ruído */}
                  <LabelList
                    dataKey="pedidos"
                    position="top"
                    offset={6}
                    formatter={(v: number) => (v ? v : "")}
                    className="fill-foreground"
                    fontSize={11}
                    fontWeight={700}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </Card>

        <Card title="Pedidos por vendedor" subtitle="Quem mais recebeu pedido no período.">
          {carregando ? (
            <Aviso>Carregando...</Aviso>
          ) : ranking.length === 0 ? (
            <Aviso>Nenhum pedido no período.</Aviso>
          ) : (
            <BarList data={ranking.map((r) => ({ label: r.nome, value: r.pedidos }))} />
          )}
        </Card>
      </div>

      <Card
        title="Vendedores sem pedido no período"
        subtitle="Quem não recebeu nenhum pedido. É aqui que costuma estar a ação."
        actions={
          semPedido.length > 0 && (
            <Badge tone="warning" icon={TriangleAlert}>
              {num(semPedido.length)} de {num(ativos)}
            </Badge>
          )
        }
      >
        {vendedoresQuery.isLoading ? (
          <p className="py-8 text-center text-sm text-ink-muted">Carregando...</p>
        ) : semPedido.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">
            Todos os vendedores ativos receberam pedido. Bom sinal.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {semPedido.map((v) => (
              <Chip key={v.id} tone="warning" icon={TriangleAlert}>
                {v.nome}
              </Chip>
            ))}
          </div>
        )}
      </Card>

      <p className="text-xs text-ink-muted">
        O pedido é gravado quando o cliente conclui no catálogo, antes de abrir o WhatsApp — os
        números contam intenção de compra.{" "}
        <Link href="/admin/pedidos" className="font-semibold text-brand hover:underline">
          Ver todos os pedidos
        </Link>
      </p>
    </div>
  );
}
