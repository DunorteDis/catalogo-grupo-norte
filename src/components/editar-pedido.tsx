"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  History,
  Package,
  Plus,
  Sparkles,
  Trash2,
  UserRoundPen,
  UserRoundSearch,
  UserRoundX,
} from "lucide-react";
import { toast } from "sonner";

import { Card, SearchInput } from "@/components/abastex";
import { BuscaDeCliente } from "@/components/busca-de-cliente";
import { CondicoesCliente } from "@/components/condicoes-cliente";
import type { PedidoDaLista } from "@/components/lista-pedidos";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatarDocumento,
  formatarTelefone,
  fotoUrl,
  UNIDADES,
  type Unidade,
} from "@/lib/catalogo";
import { chamar } from "@/lib/chamar";
import { formatarReais } from "@/lib/credito";
import { confirmar } from "@/lib/confirmar";
import { mensagemErro } from "@/lib/erros";
import { cn } from "@/lib/utils";
import { codigoPedido } from "@/lib/whatsapp";
import {
  clienteDoPedido,
  fotosPorCodigo,
  precosDoPedido,
  produtosParaPedido,
  salvarItensDoPedido,
  type ProdutoParaPedido,
} from "@/server/pedidos";

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

/** Depois de uma edição recarregam o pedido aberto e as duas listas (admin e vendedor). */
function useRecarregarPedidos() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["pedido"] });
    qc.invalidateQueries({ queryKey: ["admin-pedidos"] });
    qc.invalidateQueries({ queryKey: ["meus-pedidos"] });
  };
}

/**
 * Quem é o cliente do pedido: um da base do Winthor, escolhido na busca, nunca texto livre.
 * O nome que o cliente digitou no catálogo aparece embaixo, para ajudar a achar.
 */
export function ClienteDoPedido({ pedido }: { pedido: PedidoDaLista }) {
  const [aberto, setAberto] = useState(false);
  const [historico, setHistorico] = useState(false);
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
    <div>
      <p className="text-sm font-medium">Cliente</p>
      <div
        className={cn(
          "mt-1.5 flex items-center gap-2 rounded-md border px-3 py-2",
          c ? "bg-card" : "border-warning/40 bg-warning-soft",
        )}
      >
        <div className="min-w-0 flex-1 text-sm">
          {c ? (
            <>
              <p className="truncate font-semibold">{c.nome}</p>
              <p className="truncate text-xs text-ink-muted">
                Cód. {c.codcli}
                {c.cnpj && ` · ${formatarDocumento(c.cnpj)}`}
              </p>
            </>
          ) : (
            <p className="font-medium text-warning">Ainda não identificado</p>
          )}
        </div>
        {c && (
          <Button size="sm" variant="ghost" onClick={() => setHistorico(true)}>
            <History />
            Histórico
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className={c ? undefined : "text-warning hover:text-warning"}
          onClick={() => setAberto(true)}
        >
          {c ? <UserRoundPen /> : <UserRoundSearch />}
          {c ? "Trocar" : "Identificar cliente"}
        </Button>
      </div>
      {digitado && digitado !== c?.nome && (
        <p className="mt-1 truncate text-xs text-ink-muted">
          Nome digitado no catálogo: {digitado}
        </p>
      )}
      {pedido.telefone && (
        <p className="mt-1 text-xs text-ink-muted">
          Celular informado no catálogo: {formatarTelefone(pedido.telefone)}
        </p>
      )}

      {c && (
        <CondicoesCliente
          codcli={c.codcli}
          abaInicial="historico"
          aberto={historico}
          onFechar={() => setHistorico(false)}
        />
      )}

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
              {pedido.telefone && (
                <>
                  Celular informado: <b className="text-ink">{formatarTelefone(pedido.telefone)}</b>
                  .{" "}
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
const ORIGEM_REGIAO = {
  "cliente-filial": "do cliente nesta filial",
  cadastro: "do cadastro do cliente",
  praca: "da praça do cliente",
} as const;
const assinatura = (ls: Linha[]) =>
  ls.map((l) => `${l.id ?? l.produtoId}:${l.quantidade}:${l.unidade}`).join("|");

function Foto({ arquivo }: { arquivo: string | null | undefined }) {
  const foto = fotoUrl(arquivo);
  return (
    <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-sm bg-card text-ink-subtle">
      {foto ? (
        <img src={foto} alt="" loading="lazy" className="size-full object-contain" />
      ) : (
        <Package size={18} aria-hidden />
      )}
    </span>
  );
}

/** Total da linha pela tabela e o preço da unidade de venda (ou da caixa, quando é caixa). */
function PrecoDaLinha({
  total,
  preco,
  caixa,
  carregando,
}: {
  total: number | null;
  preco: { preco: number; porCaixa: number | null } | undefined;
  caixa: boolean;
  carregando: boolean;
}) {
  return (
    <div className="ml-auto min-w-0 text-right tabular-nums sm:w-32">
      {carregando ? (
        <span className="text-xs text-ink-subtle">Buscando preço...</span>
      ) : total != null && preco ? (
        <>
          <p className="text-sm font-semibold">{formatarReais(total)}</p>
          <p className="text-[0.6875rem] text-ink-muted">
            {formatarReais(preco.preco)} {caixa ? `× ${preco.porCaixa} por caixa` : "cada"}
          </p>
        </>
      ) : (
        <span className="text-xs text-warning">Sem preço na tabela</span>
      )}
    </div>
  );
}

/**
 * Itens do pedido sempre editáveis: quantidade, unidade, tirar e incluir produto. O produto
 * incluído sai do cadastro (busca ou sugestão), nunca de texto livre. Salvar só aparece
 * quando algo mudou. `sugeridos` vira a lista de produtos sugeridos, com "Incluir".
 */
export function EditorDeItens({
  pedido,
  sugeridos,
}: {
  pedido: PedidoDaLista;
  sugeridos?: (ProdutoParaPedido & { compras: number })[];
}) {
  const recarregar = useRecarregarPedidos();
  const [original] = useState<Linha[]>(() =>
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
  const [linhas, setLinhas] = useState(original);
  const mudar = (chave: string, campos: Partial<Linha>) =>
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...campos } : l)));
  const incluir = (p: ProdutoParaPedido) => {
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
  };

  const codigos = [...new Set(linhas.map((l) => l.codigo))].sort();
  const fotos = useQuery({
    queryKey: ["fotos-de-produtos", codigos],
    enabled: codigos.length > 0,
    queryFn: () => chamar(fotosPorCodigo(codigos)),
  });

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
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });
  const mudou = assinatura(linhas) !== assinatura(original);
  const invalida = linhas.length === 0 || linhas.some((l) => !qtdValida(l.quantidade));
  const naoIncluidos = sugeridos?.filter((s) => !linhas.some((l) => l.codigo === s.codigo));

  // Preço de tabela do Winthor na região do cliente, sem desconto: itens e sugestões.
  const codprods = [
    ...new Set(
      [...linhas, ...(sugeridos ?? [])].flatMap((x) => (x.codprod != null ? [x.codprod] : [])),
    ),
  ].sort((a, b) => a - b);
  const precos = useQuery({
    queryKey: ["pedido", pedido.id, "precos", codprods],
    queryFn: () => chamar(precosDoPedido(pedido.id, codprods)),
    enabled: !!pedido.cliente && codprods.length > 0,
    // Incluir um produto não apaga os preços que já estão na tela enquanto busca.
    placeholderData: (anterior) => anterior,
  });
  const precoDe = (codprod: number | null) =>
    codprod != null ? precos.data?.precos[codprod] : undefined;
  // Caixa é a caixa master do Winthor: qtunitcx unidades de venda.
  const totalDe = (l: Linha) => {
    const p = precoDe(l.codprod);
    const fator = l.unidade === "CX" ? p?.porCaixa : 1;
    return p && fator && qtdValida(l.quantidade) ? p.preco * fator * l.quantidade : null;
  };
  const totais = linhas.map(totalDe);
  const total = totais.reduce<number>((soma, t) => soma + (t ?? 0), 0);
  const semPreco = totais.filter((t) => t == null).length;
  const regiao = precos.data?.regiao != null ? precos.data : null;

  return (
    <>
      <Card
        title={`Itens do pedido (${linhas.length})`}
        subtitle={
          <>
            Mude quantidade e unidade, tire itens ou inclua produtos do cadastro.{" "}
            {regiao
              ? `Preços da tabela do Winthor, sem desconto: região ${regiao.regiao} (${ORIGEM_REGIAO[regiao.origem!]}), filial ${regiao.filial}.`
              : !pedido.cliente && "Identifique o cliente para ver os preços de tabela."}
          </>
        }
      >
        <ul className="flex flex-col divide-y">
          {linhas.map((l) => (
            <li key={l.chave} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
              <Foto arquivo={fotos.data?.[l.codigo]} />
              <div className="min-w-0 flex-[1_1_9rem]">
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
              <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
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
                    "h-9 w-16 shrink-0 rounded-md border border-input bg-card px-2 text-right text-sm tabular-nums sm:w-20",
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
                {pedido.cliente && (
                  <PrecoDaLinha
                    total={totalDe(l)}
                    preco={precoDe(l.codprod)}
                    caixa={l.unidade === "CX"}
                    carregando={precos.isLoading}
                  />
                )}
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
              </div>
            </li>
          ))}
          {linhas.length === 0 && (
            <li className="py-4 text-center text-sm text-ink-muted">
              O pedido precisa de pelo menos um item. Inclua um produto abaixo.
            </li>
          )}
        </ul>

        {pedido.cliente && linhas.length > 0 && (
          <div className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1 border-t pt-3">
            {semPreco > 0 && !precos.isLoading && (
              <span className="mr-auto text-xs text-warning">
                {semPreco === 1 ? "1 item sem preço" : `${semPreco} itens sem preço`} na tabela da
                região: fica fora do total.
              </span>
            )}
            <span className="text-sm text-ink-muted">Total pela tabela</span>
            <span className="text-lg font-bold tabular-nums">{formatarReais(total)}</span>
          </div>
        )}

        <div className="mt-3 border-t pt-4">
          <p className="mb-2 text-sm font-medium">Incluir produto</p>
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
                      incluir(p);
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

        {mudou && (
          <div className="sticky bottom-0 -mx-5 mt-4 flex flex-wrap items-center justify-end gap-2 border-t bg-card/95 px-5 py-3 backdrop-blur">
            <p className="mr-auto text-sm text-ink-muted">
              Há mudanças nos itens ainda não salvas.
            </p>
            <Button
              size="sm"
              variant="ghost"
              disabled={salvar.isPending}
              onClick={() => setLinhas(original)}
            >
              Descartar
            </Button>
            <Button
              size="sm"
              disabled={invalida || salvar.isPending}
              onClick={() => salvar.mutate()}
            >
              {salvar.isPending ? "Salvando..." : "Salvar itens"}
            </Button>
          </div>
        )}
      </Card>

      {sugeridos && (
        <Card
          title={
            <span className="flex items-center gap-2">
              <Sparkles className="size-4 text-brand" aria-hidden />
              Produtos sugeridos
            </span>
          }
          subtitle="O que este cliente mais comprou nos últimos 3 meses e não está no pedido. A sugestão pela IA entra aqui."
        >
          {!pedido.cliente ? (
            <p className="py-3 text-sm text-ink-muted">
              Identifique o cliente do pedido para ver as sugestões.
            </p>
          ) : naoIncluidos?.length === 0 ? (
            <p className="py-3 text-sm text-ink-muted">
              Nenhuma sugestão: o cliente não tem compras repetidas fora deste pedido.
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {naoIncluidos?.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                  <Foto arquivo={s.arquivo} />
                  <div className="min-w-0 flex-[1_1_9rem]">
                    <p className="text-[0.8125rem] font-medium leading-snug">{s.nome}</p>
                    <CodigosDoItem codigo={s.codigo} codprod={s.codprod} />
                  </div>
                  <span className="text-xs text-ink-muted">
                    Em {s.compras} {s.compras === 1 ? "pedido" : "pedidos"} nos últimos 3 meses
                  </span>
                  {precoDe(s.codprod) && (
                    <span className="w-24 text-right text-sm font-semibold tabular-nums">
                      {formatarReais(precoDe(s.codprod)!.preco)}
                    </span>
                  )}
                  <Button size="sm" variant="outline" onClick={() => incluir(s)}>
                    <Plus />
                    Incluir
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
