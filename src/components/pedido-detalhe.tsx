"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  FileSpreadsheet,
  Loader2,
  MessageCircle,
  Send,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Badge, Card } from "@/components/abastex";
import { ClienteDoPedido, EditorDeItens } from "@/components/editar-pedido";
import { EnviarCotacao } from "@/components/enviar-cotacao";
import { HistoricoConversa } from "@/components/whatsapp/historico";
import { Button } from "@/components/ui/button";
import { useConversas } from "@/hooks/use-conversas";
import { chamar } from "@/lib/chamar";
import { mensagemErro } from "@/lib/erros";
import { formatarData } from "@/lib/periodo";
import { baixarPlanilhaDoPedido } from "@/lib/planilha-pedido";
import { codigoPedido } from "@/lib/whatsapp";
import { pedidoDetalhe, sugeridosDoPedido } from "@/server/pedidos";

// ponytail: entrega, pagamento e observação da nota são ilustrativos (estado da tela, nada
// no banco) até a Fase 2 definir o cabeçalho do pedido no ERP. Aí viram colunas do pedido.
const ENTREGAS = ["Entrega no cliente", "Retirada no CD"];
const PLANOS = ["À vista", "Boleto 7 dias", "Boleto 14 dias", "Boleto 21 dias", "Boleto 28 dias"];

const CAMPO = "h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground";

function Campo({
  id,
  rotulo,
  className,
  children,
}: {
  id: string;
  rotulo: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/**
 * Tela do pedido: cabeçalho, cliente, itens editáveis, sugestões e a conversa do WhatsApp.
 * Vendedor abre os dele; admin, os da distribuidora (a regra está no servidor).
 */
export function DetalheDoPedido({ id, voltar }: { id: string; voltar: string }) {
  const conversas = useConversas();
  const pedidoQuery = useQuery({
    queryKey: ["pedido", id],
    queryFn: () => chamar(pedidoDetalhe(id)),
  });
  const pedido = pedidoQuery.data;
  const sugeridosQuery = useQuery({
    queryKey: ["pedido", id, "sugeridos"],
    queryFn: () => chamar(sugeridosDoPedido(id)),
    enabled: !!pedido?.cliente,
  });

  const [entrega, setEntrega] = useState("");
  const [tipoEntrega, setTipoEntrega] = useState(ENTREGAS[0]!);
  const [plano, setPlano] = useState("");
  const [obsNota, setObsNota] = useState("");

  if (pedidoQuery.isLoading)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-ink-subtle" />
      </div>
    );
  if (!pedido)
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <TriangleAlert className="size-8 text-danger" aria-hidden />
        <p className="text-sm text-ink-muted">
          {pedidoQuery.error ? mensagemErro(pedidoQuery.error) : "Pedido não encontrado."}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href={voltar}>Voltar para os pedidos</Link>
        </Button>
      </div>
    );

  const nomeCliente = pedido.cliente?.nome ?? pedido.cliente_nome?.trim() ?? null;
  // Muda depois de salvar: o editor recomeça com os itens que ficaram no banco.
  const versaoItens = pedido.pedido_itens
    .map((i) => `${i.id}:${i.quantidade}:${i.unidade}`)
    .join("|");

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start gap-x-3 gap-y-3">
        <Button asChild variant="ghost" size="icon" className="-ml-2">
          <Link href={voltar} aria-label="Voltar para os pedidos">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-[1_1_16rem]">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">
              Pedido <span className="font-mono text-brand">#{codigoPedido(pedido.id)}</span>
            </h1>
            <Badge tone="info" dot>
              Recebido
            </Badge>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
            <span>Recebido em {formatarData(pedido.created_at)}</span>
            {pedido.vendedores?.nome && (
              <>
                <span aria-hidden>·</span>
                <span>Vendedor {pedido.vendedores.nome}</span>
              </>
            )}
            {pedido.distribuidoras && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1.5">
                  <i
                    className="inline-block size-2 rounded-full"
                    style={{ background: pedido.distribuidoras.cor }}
                  />
                  {pedido.distribuidoras.nome}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled
            title="Em breve: confere bloqueio, crédito e preço antes de lançar"
          >
            <ShieldCheck />
            Validar políticas
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              baixarPlanilhaDoPedido({ ...pedido, cliente_nome: nomeCliente }).catch(() =>
                toast.error("Não foi possível gerar a planilha. Tente de novo."),
              )
            }
          >
            <FileSpreadsheet />
            Exportar Excel
          </Button>
          <EnviarCotacao
            pedido={pedido}
            extras={{ entrega, tipoEntrega, plano, observacao: obsNota }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled
            title="Em breve: lança o pedido direto no Winthor"
          >
            <Send />
            Lançar no ERP
          </Button>
        </div>
      </header>

      <Card
        title="Geral"
        subtitle="Entrega, pagamento e observação da nota são ilustrativos: ainda não são salvos."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="sm:col-span-2">
            <ClienteDoPedido pedido={pedido} />
          </div>
          <Campo id="entrega" rotulo="Data de entrega">
            <input
              id="entrega"
              type="date"
              value={entrega}
              onChange={(e) => setEntrega(e.target.value)}
              className={CAMPO}
            />
          </Campo>
          <Campo id="tipo-entrega" rotulo="Tipo de entrega">
            <select
              id="tipo-entrega"
              value={tipoEntrega}
              onChange={(e) => setTipoEntrega(e.target.value)}
              className={CAMPO}
            >
              {ENTREGAS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Campo>
          <Campo id="plano" rotulo="Plano de pagamento" className="sm:col-span-2 xl:col-span-1">
            <select
              id="plano"
              value={plano}
              onChange={(e) => setPlano(e.target.value)}
              className={CAMPO}
            >
              <option value="">Escolha o plano</option>
              {PLANOS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Campo>
          <Campo id="obs-nota" rotulo="Observação da nota" className="sm:col-span-2 xl:col-span-3">
            <input
              id="obs-nota"
              value={obsNota}
              onChange={(e) => setObsNota(e.target.value)}
              placeholder="Sai impressa na nota fiscal"
              maxLength={200}
              className={CAMPO}
            />
          </Campo>
        </div>
        {pedido.observacao && (
          <p className="mt-4 rounded-xl bg-surface-sunken px-3 py-2 text-sm">
            <span className="font-semibold">Observação do cliente:</span> {pedido.observacao}
          </p>
        )}
      </Card>

      <EditorDeItens key={versaoItens} pedido={pedido} sugeridos={sugeridosQuery.data ?? []} />

      {conversas && pedido.conversa_id && (
        <Card
          title={
            <span className="flex items-center gap-2">
              <MessageCircle className="size-4 text-(--wa-verde)" aria-hidden />
              Conversa do WhatsApp
            </span>
          }
        >
          <div className="overflow-hidden rounded-xl border">
            <HistoricoConversa conversaId={pedido.conversa_id} className="h-96" />
          </div>
        </Card>
      )}
    </div>
  );
}
