"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, Trash2, UserRoundPen, UserRoundSearch, UserRoundX } from "lucide-react";
import { toast } from "sonner";

import { SearchInput } from "@/components/abastex";
import { BuscaDeCliente } from "@/components/busca-de-cliente";
import type { PedidoDaLista } from "@/components/lista-pedidos";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatarDocumento, UNIDADES, type Unidade } from "@/lib/catalogo";
import { chamar } from "@/lib/chamar";
import { confirmar } from "@/lib/confirmar";
import { mensagemErro } from "@/lib/erros";
import { cn } from "@/lib/utils";
import { codigoPedido } from "@/lib/whatsapp";
import { clienteDoPedido, produtosParaPedido, salvarItensDoPedido } from "@/server/pedidos";

/**
 * Código do Winthor e EAN, cada um com o nome. Produto sem EAN tem o próprio codprod no
 * `codigo`: aí só o do Winthor aparece. Item que não achou o produto mostra o código como veio.
 */
export function CodigosDoItem({ codigo, codprod }: { codigo: string; codprod: number | null }) {
  const temEan = codprod == null || codigo !== String(codprod);
  return (
    <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-muted">
      {codprod != null && (
        <span>
          Cód. Winthor <code className="font-mono font-semibold text-ink">{codprod}</code>
        </span>
      )}
      {temEan && (
        <span>
          {codprod != null ? "EAN" : "Código"} <code className="font-mono">{codigo}</code>
        </span>
      )}
    </span>
  );
}

/** As duas telas de pedidos (admin e vendedor) recarregam depois de uma edição. */
function useRecarregarPedidos() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["admin-pedidos"] });
    qc.invalidateQueries({ queryKey: ["meus-pedidos"] });
  };
}

/**
 * Quem é o cliente do pedido: um da base do Winthor, escolhido na busca. O nome que o
 * cliente digitou no catálogo aparece ao lado, para ajudar a achar.
 */
export function ClienteDoPedido({ pedido }: { pedido: PedidoDaLista }) {
  const [aberto, setAberto] = useState(false);
  const recarregar = useRecarregarPedidos();
  const c = pedido.cliente;
  const digitado = pedido.cliente_nome?.trim();
  const escolher = useMutation({
    mutationFn: (codcli: number | null) => chamar(clienteDoPedido(pedido.id, codcli)),
    onSuccess: (_, codcli) => {
      toast.success(codcli === null ? "Cliente tirado do pedido." : "Cliente do pedido salvo.");
      recarregar();
      setAberto(false);
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-dashed py-3">
      <div className="min-w-0 flex-1 text-[0.8125rem]">
        <p className="text-xs font-semibold text-ink-muted">Cliente do pedido</p>
        {c ? (
          <p className="truncate">
            <b>{c.nome}</b>
            <span className="text-ink-muted">
              {" "}
              · Cód. {c.codcli}
              {c.cnpj && ` · ${formatarDocumento(c.cnpj)}`}
            </span>
          </p>
        ) : (
          <p className="font-medium text-warning">Ainda não identificado</p>
        )}
        {digitado && digitado !== c?.nome && (
          <p className="truncate text-xs text-ink-muted">Nome digitado no catálogo: {digitado}</p>
        )}
      </div>
      <Button
        size="sm"
        variant="ghost"
        className={c ? undefined : "bg-warning-soft text-warning hover:bg-warning-soft"}
        onClick={() => setAberto(true)}
      >
        {c ? <UserRoundPen /> : <UserRoundSearch />}
        {c ? "Trocar cliente" : "Identificar cliente"}
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>De que cliente é o pedido #{codigoPedido(pedido.id)}?</DialogTitle>
            <DialogDescription>
              {digitado && (
                <>
                  O cliente digitou <b className="text-ink">{digitado}</b> no catálogo.{" "}
                </>
              )}
              Busque na base de clientes do Winthor pelo nome, código ou CNPJ.
            </DialogDescription>
          </DialogHeader>
          <BuscaDeCliente
            ativo={aberto}
            desabilitado={escolher.isPending}
            onEscolher={(cliente) => escolher.mutate(cliente.codcli)}
          />
          {c && (
            <div className="flex justify-end border-t pt-3">
              <Button
                variant="danger"
                size="sm"
                disabled={escolher.isPending}
                onClick={async () => {
                  if (await confirmar(`Tirar ${c.nome} deste pedido?`, "Tirar"))
                    escolher.mutate(null);
                }}
              >
                <UserRoundX />
                Tirar o cliente deste pedido
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type Linha = {
  /** Chave da linha na tela. */
  chave: string;
  /** Item que já está no pedido. */
  id?: string;
  /** Produto incluído agora. */
  produtoId?: string;
  codigo: string;
  codprod: number | null;
  nome: string;
  quantidade: number;
  unidade: Unidade;
};

const qtdValida = (n: number) => Number.isInteger(n) && n >= 1 && n <= 9999;

/**
 * Itens do pedido em edição: quantidade, unidade, tirar e incluir produto. Produto incluído
 * sai do cadastro (busca por nome, EAN ou código do ERP), nunca de texto livre.
 */
export function EditorDeItens({
  pedido,
  onFechar,
}: {
  pedido: PedidoDaLista;
  onFechar: () => void;
}) {
  const recarregar = useRecarregarPedidos();
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    pedido.pedido_itens.map((i) => ({
      chave: i.id,
      id: i.id,
      codigo: i.codigo,
      codprod: i.codprod,
      nome: i.nome,
      quantidade: i.quantidade,
      unidade: i.unidade === "CX" ? "CX" : "UN",
    })),
  );
  const mudar = (chave: string, campos: Partial<Linha>) =>
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...campos } : l)));

  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTermo(busca.trim()), 350);
    return () => clearTimeout(t);
  }, [busca]);
  const produtos = useQuery({
    queryKey: ["produtos-para-pedido", termo],
    queryFn: () => chamar(produtosParaPedido(termo)),
    enabled: termo.length >= 2,
  });

  const salvar = useMutation({
    mutationFn: () =>
      chamar(
        salvarItensDoPedido(pedido.id, {
          manter: linhas.flatMap((l) =>
            l.id ? [{ id: l.id, quantidade: l.quantidade, unidade: l.unidade }] : [],
          ),
          novos: linhas.flatMap((l) =>
            l.produtoId
              ? [{ produtoId: l.produtoId, quantidade: l.quantidade, unidade: l.unidade }]
              : [],
          ),
        }),
      ),
    onSuccess: () => {
      toast.success("Itens do pedido salvos.");
      recarregar();
      onFechar();
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });
  const invalida = linhas.length === 0 || linhas.some((l) => !qtdValida(l.quantidade));

  return (
    <div className="py-3">
      <ul className="flex flex-col gap-2">
        {linhas.map((l) => (
          <li
            key={l.chave}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card px-3 py-2"
          >
            <div className="min-w-0 flex-[1_1_14rem]">
              <p className="text-[0.8125rem] font-medium leading-snug">
                {l.nome}
                {l.produtoId && (
                  <span className="ml-2 rounded-full bg-mint-soft px-1.5 text-[0.6875rem] font-semibold text-mint-ink">
                    novo
                  </span>
                )}
              </p>
              <CodigosDoItem codigo={l.codigo} codprod={l.codprod} />
            </div>
            <input
              value={Number.isNaN(l.quantidade) ? "" : String(l.quantidade)}
              onChange={(e) => {
                const digitos = e.target.value.replace(/\D/g, "").slice(0, 4);
                mudar(l.chave, { quantidade: digitos ? Number(digitos) : Number.NaN });
              }}
              inputMode="numeric"
              aria-label={`Quantidade de ${l.nome}`}
              aria-invalid={!qtdValida(l.quantidade)}
              className={cn(
                "h-9 w-20 rounded-md border border-input bg-card px-2 text-right text-sm tabular-nums",
                !qtdValida(l.quantidade) && "border-danger",
              )}
            />
            <select
              value={l.unidade}
              onChange={(e) => mudar(l.chave, { unidade: e.target.value as Unidade })}
              aria-label={`Unidade de ${l.nome}`}
              className="h-9 rounded-md border border-input bg-card px-2 text-sm"
            >
              {UNIDADES.map((u) => (
                <option key={u.valor} value={u.valor}>
                  {u.nome}
                </option>
              ))}
            </select>
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-danger hover:text-danger"
              aria-label={`Tirar ${l.nome} do pedido`}
              title="Tirar do pedido"
              onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
        {linhas.length === 0 && (
          <li className="rounded-xl border border-dashed p-4 text-center text-sm text-ink-muted">
            O pedido precisa de pelo menos um item. Inclua um produto abaixo.
          </li>
        )}
      </ul>

      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold text-ink-muted">Incluir produto</p>
        <SearchInput
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Nome, EAN ou código do Winthor"
          className="max-w-none"
        />
        {termo.length >= 2 && (
          <ul className="mt-2 max-h-64 overflow-y-auto rounded-xl border bg-card">
            {produtos.isFetching && !produtos.data && (
              <li className="p-3 text-center text-sm text-ink-muted">Buscando...</li>
            )}
            {produtos.data?.length === 0 && (
              <li className="p-3 text-center text-sm text-ink-muted">
                Nenhum produto ativo com isso.
              </li>
            )}
            {produtos.data?.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (linhas.some((l) => l.codigo === p.codigo)) {
                      toast.info("Esse produto já está no pedido: mude a quantidade nele.");
                      return;
                    }
                    setLinhas((ls) => [
                      ...ls,
                      {
                        chave: `novo-${p.id}`,
                        produtoId: p.id,
                        codigo: p.codigo,
                        codprod: p.codprod,
                        nome: p.nome,
                        quantidade: 1,
                        unidade: "UN",
                      },
                    ]);
                    setBusca("");
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left hover:bg-surface-hover"
                >
                  <Plus className="size-4 shrink-0 text-brand" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.nome}</span>
                    <CodigosDoItem codigo={p.codigo} codprod={p.codprod} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex justify-end gap-2 border-t border-dashed pt-3">
        <Button size="sm" variant="ghost" disabled={salvar.isPending} onClick={onFechar}>
          Cancelar
        </Button>
        <Button size="sm" disabled={invalida || salvar.isPending} onClick={() => salvar.mutate()}>
          {salvar.isPending ? "Salvando..." : "Salvar itens"}
        </Button>
      </div>
    </div>
  );
}
