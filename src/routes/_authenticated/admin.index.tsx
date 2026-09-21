import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, TriangleAlert } from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { fimDoDia, inicioDoDia, paraInput } from "@/lib/periodo";
import { cn } from "@/lib/utils";
import { FiltroPeriodo, periodoInicial } from "@/components/filtro-periodo";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminHome,
});

/** Série única: uma cor só. Ramp por valor em categoria nominal duplicaria o que o tamanho da barra já diz. */
const COR = "var(--color-primary)";

function variacao(atual: number, anterior: number) {
  if (anterior === 0) return atual === 0 ? 0 : null; // null = sem base de comparação
  return Math.round(((atual - anterior) / anterior) * 100);
}

function Kpi({
  rotulo,
  valor,
  delta,
  sufixo,
}: {
  rotulo: string;
  valor: number | string;
  delta?: number | null;
  sufixo?: string;
}) {
  const Seta = delta == null || delta === 0 ? ArrowRight : delta > 0 ? ArrowUp : ArrowDown;
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </p>
      <p className="mt-1.5 text-3xl font-extrabold tabular-nums">
        {valor}
        {sufixo && <span className="ml-1 text-base font-bold text-muted-foreground">{sufixo}</span>}
      </p>
      {delta !== undefined && (
        <p
          className={cn(
            "mt-1 flex items-center gap-1 text-xs font-medium",
            delta == null || delta === 0
              ? "text-muted-foreground"
              : delta > 0
                ? "text-success"
                : "text-destructive",
          )}
        >
          <Seta className="h-3 w-3" />
          {delta == null
            ? "sem base anterior"
            : `${delta > 0 ? "+" : ""}${delta}% vs período anterior`}
        </p>
      )}
    </div>
  );
}

function Painel({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="text-sm font-bold">{titulo}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

type PedidoResumo = {
  created_at: string;
  total_itens: number;
  vendedor_id: string | null;
  vendedores: { nome: string } | null;
};

function AdminHome() {
  // Painel abre em 30 dias: um dashboard é sobre tendência, não sobre o dia.
  const [periodo, setPeriodo] = useState(() => periodoInicial("30dias"));

  const inicio = inicioDoDia(periodo.de);
  const fim = fimDoDia(periodo.ate);
  const dias = Math.max(1, Math.round((fim.getTime() - inicio.getTime()) / 86_400_000));
  // Período anterior de mesmo tamanho, imediatamente antes.
  const inicioAnterior = new Date(inicio.getTime() - dias * 86_400_000);

  const pedidosQuery = useQuery({
    queryKey: ["painel-pedidos", inicio.toISOString(), fim.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("created_at, total_itens, vendedor_id, vendedores(nome)")
        .gte("created_at", inicioAnterior.toISOString())
        .lte("created_at", fim.toISOString())
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as PedidoResumo[];
    },
  });

  const vendedoresQuery = useQuery({
    queryKey: ["painel-vendedores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendedores")
        .select("id, nome, slug")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data;
    },
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

  const porVendedor = new Map<string, { nome: string; pedidos: number; itens: number }>();
  for (const p of noPeriodo) {
    const nome = p.vendedores?.nome ?? "Sem vendedor";
    const atual = porVendedor.get(nome) ?? { nome, pedidos: 0, itens: 0 };
    atual.pedidos++;
    atual.itens += p.total_itens ?? 0;
    porVendedor.set(nome, atual);
  }
  const ranking = [...porVendedor.values()].sort((a, b) => b.pedidos - a.pedidos).slice(0, 8);
  const semPedido = (vendedoresQuery.data ?? []).filter((v) => !comPedido.has(v.id));

  const carregando = pedidosQuery.isLoading;

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Visão geral</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Como andam os pedidos e a equipe. Sem valores — o sistema não registra preço.
      </p>

      <div className="mt-6">
        <FiltroPeriodo valor={periodo} onChange={setPeriodo} carregando={pedidosQuery.isFetching} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          rotulo="Pedidos"
          valor={noPeriodo.length}
          delta={variacao(noPeriodo.length, anteriores.length)}
        />
        <Kpi rotulo="Itens pedidos" valor={itens} delta={variacao(itens, itensAnt)} />
        <Kpi
          rotulo="Vendedores com pedido"
          valor={comPedido.size}
          sufixo={`de ${vendedoresQuery.data?.length ?? 0}`}
          delta={variacao(comPedido.size, comPedidoAnt.size)}
        />
        <Kpi
          rotulo="Itens por pedido"
          valor={media.toFixed(1)}
          delta={variacao(Math.round(media * 10), Math.round(mediaAnt * 10))}
        />
      </div>

      {pedidosQuery.error && (
        <div className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm font-bold text-destructive">Não foi possível carregar o painel.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {(pedidosQuery.error as Error).message}
          </p>
        </div>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Painel titulo="Pedidos por dia" descricao="Dias sem pedido aparecem como zero.">
          {carregando ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : noPeriodo.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Nenhum pedido no período.
            </p>
          ) : (
            <ChartContainer
              config={{ pedidos: { label: "Pedidos", color: "var(--primary)" } }}
              className="h-56 w-full"
            >
              <BarChart data={porDia} margin={{ left: -20, right: 4, top: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
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
                <Bar dataKey="pedidos" fill={COR} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ChartContainer>
          )}
        </Painel>

        <Painel titulo="Pedidos por vendedor" descricao="Quem mais recebeu pedido no período.">
          {carregando ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : ranking.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Nenhum pedido no período.
            </p>
          ) : (
            <ChartContainer
              config={{ pedidos: { label: "Pedidos", color: "var(--primary)" } }}
              className="h-56 w-full"
            >
              <BarChart
                data={ranking}
                layout="vertical"
                margin={{ left: 4, right: 28, top: 4, bottom: 4 }}
              >
                <CartesianGrid horizontal={false} stroke="var(--border)" />
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="nome"
                  tickLine={false}
                  axisLine={false}
                  width={130}
                  fontSize={11}
                />
                <ChartTooltip content={<ChartTooltipContent />} cursor={false} />
                <Bar dataKey="pedidos" fill={COR} radius={[0, 4, 4, 0]} maxBarSize={22}>
                  {/* eixo oculto: sem o rotulo na ponta o numero seria ilegivel.
                      Poucas barras, entao rotular todas nao vira ruido. */}
                  <LabelList
                    dataKey="pedidos"
                    position="right"
                    offset={8}
                    className="fill-foreground"
                    fontSize={11}
                    fontWeight={700}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </Painel>
      </div>

      <div className="mt-3">
        <Painel
          titulo="Vendedores sem pedido no período"
          descricao="Quem não recebeu nenhum pedido. É aqui que costuma estar a ação."
        >
          {vendedoresQuery.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : semPedido.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Todos os vendedores ativos receberam pedido. Bom sinal.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {semPedido.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/5 px-3 py-2 text-sm font-semibold"
                >
                  <TriangleAlert className="h-3.5 w-3.5 text-warning" />
                  {v.nome}
                </li>
              ))}
            </ul>
          )}
        </Painel>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        O pedido é gravado quando o cliente conclui no catálogo, antes de abrir o WhatsApp — os
        números contam intenção de compra.{" "}
        <Link to="/admin/pedidos" className="font-semibold underline underline-offset-2">
          Ver todos os pedidos
        </Link>
      </p>
    </div>
  );
}
