"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState, type ReactNode } from "react";
import {
  AlarmClock,
  Ban,
  CalendarClock,
  CalendarPlus,
  ChevronDown,
  CircleCheck,
  CirclePause,
  HandCoins,
  History,
  Package,
  Info,
  Landmark,
  Link2,
  PiggyBank,
  ReceiptText,
  RefreshCw,
  ShoppingCart,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { toast } from "sonner";

import { Badge, FilterTabs, SearchInput } from "@/components/abastex";
import { MenuLinkCatalogo } from "@/components/link-catalogo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { iniciais } from "@/lib/acessos";
import { formatarDocumento, fotoUrl } from "@/lib/catalogo";
import { chamar } from "@/lib/chamar";
import { copiarTexto } from "@/lib/copiar";
import {
  diasDesde,
  formatarDia,
  formatarReais,
  plural,
  resumoCredito,
  situacaoTitulo,
} from "@/lib/credito";
import { mensagemErro } from "@/lib/erros";
import { cn } from "@/lib/utils";
import {
  condicoesCliente,
  chaveDoCliente,
  historicoDoCliente,
  itensDoPedidoErp,
  type HistoricoCliente,
  type CondicoesCliente as Dados,
} from "@/server/carteira";

const COR_TITULO = {
  vencido: { borda: "border-l-danger", pill: "bg-danger-soft text-danger" },
  vence: { borda: "border-l-(--warning-fill)", pill: "bg-warning-soft text-warning" },
  "em-dia": { borda: "border-l-mint", pill: "bg-mint-soft text-mint-ink" },
} as const;

/**
 * Crédito, títulos e bloqueio do cliente, para decidir a venda a prazo, e o histórico de
 * compras, num drawer à direita. Usada nas carteiras, em Clientes, nas Conversas e no pedido.
 */
export function CondicoesCliente({
  codcli,
  comLink = false,
  abaInicial = "condicoes",
  aberto,
  onFechar,
}: {
  codcli: number | null;
  /** Vendedor olhando o próprio cliente: mostra o link do catálogo dele. */
  comLink?: boolean;
  /** Aba que abre: condições (crédito e títulos) ou o histórico de compras. */
  abaInicial?: Aba;
  aberto: boolean;
  onFechar: () => void;
}) {
  // Cada abertura começa na aba pedida por quem abriu.
  const [aba, setAba] = useState<Aba>(abaInicial);
  const [estavaAberto, setEstavaAberto] = useState(aberto);
  if (aberto !== estavaAberto) {
    setEstavaAberto(aberto);
    if (aberto) setAba(abaInicial);
  }
  const { data, isLoading, error } = useQuery({
    queryKey: ["condicoes-cliente", codcli],
    queryFn: () => chamar(condicoesCliente(codcli!)),
    enabled: aberto && codcli != null,
  });

  const [largura, alca] = useLarguraArrastavel();

  return (
    <Sheet open={aberto} onOpenChange={(a) => !a && onFechar()}>
      <SheetContent
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        style={{ width: largura, maxWidth: "100vw" }}
      >
        {alca}
        {/* @container: os cartões se arrumam pela largura do drawer, não da tela. */}
        <div className="@container min-h-0 flex-1 overflow-y-auto">
          {data ? (
            <Conteudo dados={data} comLink={comLink} aba={aba} onAba={setAba} />
          ) : (
            <div className="p-6">
              <SheetTitle>Condições do cliente</SheetTitle>
              <SheetDescription className="mt-1">
                {isLoading ? "Buscando crédito, títulos e bloqueio no Winthor..." : null}
              </SheetDescription>
              {error && (
                <p className="mt-4 rounded-xl bg-danger-soft p-4 text-sm text-danger">
                  {mensagemErro(error)}
                </p>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Link do catálogo já com o cliente, para mandar por fora das Conversas: o vendedor escolhe
 * o catálogo no menu. "Gerar novo link" é para link que foi parar com outra pessoa: os
 * links já mandados a este cliente param de funcionar.
 */
function LinkCatalogo({ codcli }: { codcli: number }) {
  // O último copiado fica à vista: o aviso some e o vendedor perde a certeza de qual foi.
  const [copiado, setCopiado] = useState<{ url: string; catalogo: string } | null>(null);
  const copiar = async (url: string, catalogo: string) => {
    if (await copiarTexto(url)) {
      setCopiado({ url, catalogo });
      toast.success(`Link do catálogo ${catalogo} copiado.`);
    } else toast.error("Não foi possível copiar o link. Tente de novo.");
  };
  const renovar = useMutation({
    mutationFn: () => chamar(chaveDoCliente(codcli, true)),
    onSuccess: () => {
      setCopiado(null);
      toast.success("Link novo gerado. Os que você já mandou a este cliente pararam de funcionar.");
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <MenuLinkCatalogo codcli={codcli} onLink={copiar}>
          <Button size="sm" variant="outline" className="bg-card">
            <Link2 />
            Copiar link do catálogo
            <ChevronDown />
          </Button>
        </MenuLinkCatalogo>
        <Button
          size="sm"
          variant="ghost"
          disabled={renovar.isPending}
          title="Use se o link foi parar com outra pessoa: os já mandados param de funcionar"
          onClick={() => renovar.mutate()}
        >
          <RefreshCw />
          Gerar novo link
        </Button>
      </div>
      {copiado && (
        <div className="mt-3 rounded-xl bg-card px-3 py-2 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-mint-ink">
            <CircleCheck className="size-4 shrink-0" aria-hidden />
            Copiado: catálogo {copiado.catalogo}
          </p>
          <p className="mt-0.5 truncate text-xs text-ink-muted" title={copiado.url}>
            {copiado.url}
          </p>
        </div>
      )}
    </div>
  );
}

const CHAVE_LARGURA = "condicoes-cliente:largura";

// Em rem (26,25 e 36): com a base de 90% do notebook, o drawer encolhe junto com o conteúdo.
const emPx = (rem: number) =>
  rem *
  (typeof document === "undefined"
    ? 16
    : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
const LARGURA_MINIMA = () => emPx(26.25);
const LARGURA_PADRAO = () => emPx(36);

const limitar = (px: number) =>
  Math.round(Math.max(LARGURA_MINIMA(), Math.min(px, window.innerWidth * 0.95)));

/**
 * Largura do drawer puxando a borda esquerda com o mouse (setas no teclado; duplo clique
 * volta ao padrão). Fica guardada no navegador para a próxima vez.
 */
function useLarguraArrastavel() {
  const [largura, setLargura] = useState(() => {
    try {
      return Number(localStorage.getItem(CHAVE_LARGURA)) || LARGURA_PADRAO();
    } catch {
      return LARGURA_PADRAO();
    }
  });
  const atual = useRef(largura);
  const mudar = (px: number) => {
    atual.current = limitar(px);
    setLargura(atual.current);
  };
  const guardar = () => {
    try {
      localStorage.setItem(CHAVE_LARGURA, String(atual.current));
    } catch {
      // Navegador sem armazenamento (aba anônima): a largura só não fica guardada.
    }
  };

  function arrastar(e: React.PointerEvent) {
    e.preventDefault();
    const mover = (ev: PointerEvent) => mudar(window.innerWidth - ev.clientX);
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      guardar();
    };
    // Enquanto arrasta, o cursor não pisca e o texto não fica selecionado.
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  }

  const alca = (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Largura do painel: arraste ou use as setas"
      aria-valuenow={largura}
      tabIndex={0}
      onPointerDown={arrastar}
      onDoubleClick={() => {
        mudar(LARGURA_PADRAO());
        guardar();
      }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        mudar(atual.current + (e.key === "ArrowLeft" ? 40 : -40));
        guardar();
      }}
      title="Arraste para mudar a largura · duplo clique volta ao padrão"
      className="group absolute inset-y-0 left-0 z-10 hidden w-3 -translate-x-1/2 cursor-col-resize outline-none sm:block"
    >
      <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors group-hover:bg-brand group-focus-visible:bg-brand" />
      <span className="absolute top-1/2 left-1/2 h-10 w-1.5 -translate-1/2 rounded-full bg-line-strong transition-colors group-hover:bg-brand group-focus-visible:bg-brand" />
    </div>
  );
  return [largura, alca] as const;
}

function Conteudo({
  dados,
  comLink,
  aba,
  onAba,
}: {
  dados: Dados;
  comLink: boolean;
  aba: Aba;
  onAba: (aba: Aba) => void;
}) {
  const { cliente: c, titulos, creditos } = dados;
  const r = resumoCredito(c.limite, titulos);

  const status = !c.ativo
    ? {
        rotulo: "Inativo no Winthor",
        icone: CirclePause,
        faixa: "bg-warning-soft",
        pill: "bg-warning text-primary-foreground",
      }
    : c.bloqueado
      ? {
          rotulo: c.bloqueioDefinitivo ? "Bloqueio definitivo" : "Bloqueado",
          icone: Ban,
          faixa: "bg-danger-soft",
          pill: "bg-danger text-primary-foreground",
        }
      : {
          rotulo: "Liberado para vender",
          icone: CircleCheck,
          faixa: "bg-mint-soft",
          pill: "bg-mint text-on-mint",
        };
  const StatusIcone = status.icone;

  const barra = r.uso >= 1 ? "bg-danger" : r.uso >= 0.7 ? "bg-(--warning-fill)" : "bg-mint";

  return (
    <>
      <header className={cn("px-6 pb-5 pt-6", status.faixa)}>
        <div className="flex items-start gap-4 pr-8">
          <span
            className="grid size-12 shrink-0 place-items-center rounded-2xl bg-card text-base font-bold uppercase text-brand shadow-card"
            aria-hidden
          >
            {iniciais(c.nome)}
          </span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-lg leading-tight">{c.nome}</SheetTitle>
            {c.razao !== c.nome && <p className="truncate text-sm text-ink-muted">{c.razao}</p>}
            <SheetDescription className="mt-1 text-xs">
              Cód. {c.codcli}
              {c.cnpj && ` · ${formatarDocumento(c.cnpj)}`}
              {c.cidade && ` · ${c.cidade}${c.uf ? `/${c.uf}` : ""}`}
            </SheetDescription>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold",
              status.pill,
            )}
          >
            <StatusIcone className="size-4" aria-hidden />
            {status.rotulo}
          </span>
          {c.ativo && c.bloqueado && c.bloqueadoEm && (
            <span className="text-xs font-medium text-danger">
              desde {formatarDia(c.bloqueadoEm)}
            </span>
          )}
        </div>
        {c.bloqueado && c.motivoBloqueio && (
          <p className="mt-3 rounded-xl bg-card px-3 py-2 text-sm text-danger">
            <b>Motivo:</b> {c.motivoBloqueio}
          </p>
        )}
        {comLink && <LinkCatalogo key={c.codcli} codcli={c.codcli} />}
      </header>

      <div className="px-6 pt-4">
        <FilterTabs
          options={[
            { value: "condicoes", label: "Condições", icon: Landmark },
            { value: "historico", label: "Histórico", icon: History },
          ]}
          value={aba}
          onChange={onAba}
        />
      </div>

      {aba === "historico" ? (
        <HistoricoDoCliente codcli={c.codcli} />
      ) : (
        <div className="flex flex-col gap-5 px-6 py-5">
          <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
            <Numero
              icone={Landmark}
              cor="bg-brand-soft text-brand"
              rotulo="Limite de crédito"
              valor={formatarReais(c.limite)}
              detalhe={
                c.limite <= 0
                  ? "sem limite no Winthor"
                  : c.limiteVence
                    ? `vence em ${formatarDia(c.limiteVence)}`
                    : "sem vencimento"
              }
            />
            <Numero
              icone={ReceiptText}
              cor="bg-info-soft text-info"
              rotulo="Em aberto"
              valor={formatarReais(r.emAberto)}
              detalhe={plural(titulos.length, "título")}
            />
            <Numero
              icone={r.vencido > 0 ? AlarmClock : CircleCheck}
              cor={r.vencido > 0 ? "bg-danger-soft text-danger" : "bg-mint-soft text-mint-ink"}
              rotulo="Vencido"
              valor={formatarReais(r.vencido)}
              detalhe={
                r.qtdVencidos > 0
                  ? `${plural(r.qtdVencidos, "título")} · até ${plural(r.maiorAtraso, "dia")}`
                  : "nada vencido"
              }
            />
            <Numero
              icone={HandCoins}
              cor={
                c.limite <= 0
                  ? "bg-surface-sunken text-ink-muted"
                  : r.uso >= 1
                    ? "bg-danger-soft text-danger"
                    : r.uso >= 0.7
                      ? "bg-warning-soft text-warning"
                      : "bg-mint-soft text-mint-ink"
              }
              rotulo="Crédito disponível"
              valor={formatarReais(Math.max(0, r.livre))}
              detalhe={
                c.limite <= 0
                  ? "sem limite no Winthor"
                  : r.livre < 0
                    ? `estourou em ${formatarReais(-r.livre)}`
                    : `${Math.round((1 - r.uso) * 100)}% do limite livre`
              }
            />
          </div>

          {/* Conta corrente do cliente (devoluções, pagamentos a mais): rara, só aparece quando há. */}
          {c.credito > 0 && (
            <p className="flex items-center gap-3 rounded-2xl bg-mint-soft px-4 py-3 text-sm text-mint-ink">
              <PiggyBank className="size-5 shrink-0" aria-hidden />
              <span>
                O cliente tem <b>{formatarReais(c.credito)}</b> de crédito a usar, de devoluções e
                pagamentos, que pode ser abatido numa próxima nota.
              </span>
            </p>
          )}

          {c.limite > 0 && (
            <section className="rounded-2xl border p-4">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold">Uso do limite</span>
                <span className="font-bold tabular-nums">{Math.round(r.uso * 100)}%</span>
              </div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className={cn("h-full rounded-full transition-all", barra)}
                  style={{ width: `${Math.min(100, r.uso * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-ink-muted">
                {r.livre < 0 && (
                  <>
                    Acima do limite em <b className="text-danger">{formatarReais(-r.livre)}</b>
                    .{" "}
                  </>
                )}
                Crédito disponível é o limite menos os títulos em aberto; pedido ainda não faturado
                não entra.
              </p>
            </section>
          )}

          <dl className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
            <Dado icone={Wallet} rotulo="Cobrança" valor={c.cobranca ?? "—"} />
            <Dado
              icone={CalendarClock}
              rotulo="Plano de pagamento"
              valor={c.plano != null ? `Plano ${c.plano}` : "—"}
            />
            <Dado
              icone={ShoppingCart}
              rotulo="Última compra"
              valor={c.ultimaCompra ? formatarDia(c.ultimaCompra) : "—"}
              detalhe={
                c.ultimaCompra ? `há ${plural(diasDesde(c.ultimaCompra), "dia")}` : undefined
              }
            />
            <Dado
              icone={CalendarPlus}
              rotulo="Cliente desde"
              valor={c.cadastro ? formatarDia(c.cadastro) : "—"}
            />
          </dl>

          {c.obsCredito && (
            <p className="flex gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <b>Observação de crédito:</b> {c.obsCredito}
              </span>
            </p>
          )}

          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
              <ReceiptText className="size-4 text-info" aria-hidden />
              Títulos em aberto
              <Badge tone="info">{titulos.length}</Badge>
            </h3>
            {titulos.length === 0 ? (
              <p className="flex items-center gap-2 rounded-xl bg-mint-soft px-4 py-3 text-sm font-medium text-mint-ink">
                <CircleCheck className="size-4" aria-hidden />
                Nenhum título em aberto.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {titulos.map((t, i) => {
                  const s = situacaoTitulo(t.diasAtraso);
                  const cor = COR_TITULO[s.tom];
                  return (
                    <li
                      key={`${t.documento}-${i}`}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border border-l-4 bg-card px-3 py-2",
                        cor.borda,
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                          Venc. {formatarDia(t.vencimento)}
                          <span
                            className={cn("rounded-full px-2 py-0.5 text-xs font-bold", cor.pill)}
                          >
                            {s.texto}
                          </span>
                        </p>
                        <p className="truncate text-xs text-ink-muted">
                          Doc. {t.documento}
                          {t.cobranca && ` · cobrança ${t.cobranca}`}
                          {t.pago > 0 &&
                            ` · pago ${formatarReais(t.pago)} de ${formatarReais(t.valor)}`}
                        </p>
                      </div>
                      <span className="text-sm font-bold tabular-nums">
                        {formatarReais(t.saldo)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {creditos.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
                <PiggyBank className="size-4 text-mint-ink" aria-hidden />
                Créditos a usar
                <Badge tone="success">{creditos.length}</Badge>
              </h3>
              <ul className="flex flex-col gap-1.5">
                {creditos.map((k, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 rounded-xl border border-l-4 border-l-mint bg-card px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {k.historico ?? "Crédito do cliente"}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {k.data && formatarDia(k.data)}
                        {k.nota ? ` · nota ${k.nota}` : ""}
                      </p>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-mint-ink">
                      {formatarReais(k.valor)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-center text-xs text-ink-subtle">
            Dados do Winthor, atualizados uma vez por dia. Títulos de verba (VERB) não entram na
            conta.
          </p>
        </div>
      )}
    </>
  );
}

function Numero({
  icone: Icone,
  cor,
  rotulo,
  valor,
  detalhe,
}: {
  icone: LucideIcon;
  cor: string;
  rotulo: string;
  valor: string;
  detalhe: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-2xl p-3", cor)}>
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
        <Icone className="size-4 shrink-0" aria-hidden />
        {rotulo}
      </span>
      <span className="text-lg font-bold leading-tight tabular-nums">{valor}</span>
      <span className="text-xs opacity-80">{detalhe}</span>
    </div>
  );
}

function Dado({
  icone: Icone,
  rotulo,
  valor,
  detalhe,
}: {
  icone: LucideIcon;
  rotulo: string;
  valor: ReactNode;
  detalhe?: string | undefined;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-surface-sunken px-3 py-2.5">
      <Icone className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
      <div className="min-w-0">
        <dt className="text-xs text-ink-muted">{rotulo}</dt>
        <dd className="text-sm font-semibold">{valor}</dd>
        {detalhe && <dd className="text-xs text-ink-subtle">{detalhe}</dd>}
      </div>
    </div>
  );
}

type Aba = "condicoes" | "historico";

const POSICAO: Record<string, { rotulo: string; tom: "success" | "info" | "warning" | "danger" }> =
  {
    FATURADO: { rotulo: "Faturado", tom: "success" },
    LIBERADO: { rotulo: "Liberado", tom: "info" },
    MONTADO: { rotulo: "Montado", tom: "info" },
    PENDENTE: { rotulo: "Pendente", tom: "warning" },
    BLOQUEADO: { rotulo: "Bloqueado", tom: "danger" },
  };

/**
 * Histórico de compras do cliente nas vendas do Winthor (últimos ~3 meses): resumo, os
 * últimos pedidos e o mix, com a última compra e o preço pago em cada produto.
 */
function HistoricoDoCliente({ codcli }: { codcli: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["historico-cliente", codcli],
    queryFn: () => chamar(historicoDoCliente(codcli)),
  });
  const [busca, setBusca] = useState("");
  const [todos, setTodos] = useState(false);
  const [secao, setSecao] = useState<"pedidos" | "mix">("pedidos");

  if (isLoading)
    return <p className="px-6 py-5 text-sm text-ink-muted">Buscando o histórico de compras...</p>;
  if (error || !data)
    return (
      <p className="m-6 rounded-xl bg-danger-soft p-4 text-sm text-danger">{mensagemErro(error)}</p>
    );

  const { resumo, pedidos, produtos } = data;
  const termo = busca.trim().toLowerCase();
  const filtrados = termo
    ? produtos.filter((p) =>
        `${p.nome} ${p.codprod} ${p.codigo ?? ""}`.toLowerCase().includes(termo),
      )
    : produtos;
  const visiveis = todos || termo ? filtrados : filtrados.slice(0, 20);

  return (
    <div className="flex flex-col gap-5 px-6 py-5">
      <p className="text-xs text-ink-muted">
        Vendas do Winthor dos últimos 3 meses
        {resumo.desde && ` (desde ${formatarDia(resumo.desde)})`}, atualizadas uma vez por dia.
      </p>

      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3">
        <Numero
          icone={ReceiptText}
          cor="bg-brand-soft text-brand"
          rotulo="Pedidos"
          valor={String(resumo.pedidos)}
          detalhe="nos últimos 3 meses"
        />
        <Numero
          icone={Wallet}
          cor="bg-mint-soft text-mint-ink"
          rotulo="Faturado"
          valor={formatarReais(resumo.faturado)}
          detalhe={
            resumo.pedidos ? `média de ${formatarReais(resumo.faturado / resumo.pedidos)}` : ""
          }
        />
        <Numero
          icone={ShoppingCart}
          cor="bg-info-soft text-info"
          rotulo="Última compra"
          valor={resumo.ultimaCompra ? formatarDia(resumo.ultimaCompra) : "—"}
          detalhe={resumo.ultimaCompra ? `há ${plural(diasDesde(resumo.ultimaCompra), "dia")}` : ""}
        />
      </div>

      <FilterTabs
        options={[
          // Sem ícone e com rótulo curto: no celular, as duas cabem lado a lado.
          { value: "pedidos", label: `Pedidos (${pedidos.length})` },
          { value: "mix", label: `Mix de compra (${produtos.length})` },
        ]}
        value={secao}
        onChange={setSecao}
      />

      {secao === "pedidos" ? (
        <section>
          {pedidos.length === 0 ? (
            <p className="rounded-xl bg-surface-sunken px-4 py-3 text-sm text-ink-muted">
              Nenhum pedido nos últimos 3 meses.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {pedidos.map((p) => (
                <PedidoDoHistorico key={p.numped} codcli={codcli} pedido={p} />
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section>
          <p className="mb-2 text-xs text-ink-muted">
            Em quantos pedidos cada produto entrou, a última compra e o preço pago nela (por unidade
            de venda).
          </p>
          {produtos.length > 8 && (
            <SearchInput
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar no mix por nome ou código"
              className="mb-2 max-w-none"
            />
          )}
          {produtos.length === 0 ? (
            <p className="rounded-xl bg-surface-sunken px-4 py-3 text-sm text-ink-muted">
              Nenhuma compra nos últimos 3 meses.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {visiveis.map((p) => (
                <ItemDoMix key={p.codprod} produto={p} />
              ))}
              {visiveis.length === 0 && (
                <li className="py-3 text-center text-sm text-ink-muted">
                  Nenhum produto com isso.
                </li>
              )}
            </ul>
          )}
          {!todos && !termo && filtrados.length > visiveis.length && (
            <Button
              size="sm"
              variant="ghost"
              className="mt-2 w-full"
              onClick={() => setTodos(true)}
            >
              Mostrar todos os {filtrados.length} produtos
            </Button>
          )}
        </section>
      )}
    </div>
  );
}

function ItemDoMix({ produto: p }: { produto: HistoricoCliente["produtos"][number] }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2">
      <MiniFoto arquivo={p.arquivo} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.8125rem] font-semibold">{p.nome}</p>
        <p className="truncate text-xs text-ink-muted">
          Cód. Winthor {p.codprod}
          {p.codigo && p.codigo !== String(p.codprod) && ` · EAN ${p.codigo}`}
        </p>
        <p className="truncate text-xs text-ink-muted">
          Em {plural(p.pedidos, "pedido")}
          {p.ultimaCompra && ` · última em ${formatarDia(p.ultimaCompra)}`}
          {p.ultimaQtd != null && ` (${p.ultimaQtd.toLocaleString("pt-BR")} un.)`}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-bold tabular-nums">
          {p.ultimoPreco != null ? formatarReais(p.ultimoPreco) : "—"}
        </p>
        <p className="text-[0.6875rem] text-ink-subtle">último preço</p>
      </div>
    </li>
  );
}

/** Pedido do histórico: o resumo, e ao tocar, os itens (buscados só quando abre). */
function PedidoDoHistorico({
  codcli,
  pedido: p,
}: {
  codcli: number;
  pedido: HistoricoCliente["pedidos"][number];
}) {
  const [aberto, setAberto] = useState(false);
  const itens = useQuery({
    queryKey: ["historico-itens", codcli, p.numped],
    queryFn: () => chamar(itensDoPedidoErp(codcli, p.numped)),
    enabled: aberto,
  });
  const pos = POSICAO[p.posicao ?? ""];
  return (
    <li className={cn("rounded-xl border bg-card", aberto && "border-brand")}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {p.data ? formatarDia(p.data) : "Sem data"}
            <span className="font-mono text-xs font-normal text-ink-muted">nº {p.numped}</span>
            {pos ? (
              <Badge tone={pos.tom} dot>
                {pos.rotulo}
              </Badge>
            ) : (
              p.posicao && <Badge>{p.posicao}</Badge>
            )}
          </p>
          <p className="truncate text-xs text-ink-muted">
            {plural(p.itens, "produto")}
            {p.nota && ` · nota ${p.nota}`}
            {p.entrega && ` · entrega ${formatarDia(p.entrega)}`}
            {p.situacaoEntrega && ` (${p.situacaoEntrega.toLowerCase()})`}
          </p>
        </div>
        <span className="text-sm font-bold tabular-nums">
          {p.valor === 0 ? "Bonificação" : formatarReais(p.valorFaturado ?? p.valor)}
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-ink-subtle transition", aberto && "rotate-180")}
          aria-hidden
        />
      </button>
      {aberto && (
        <div className="border-t px-3 py-2">
          {itens.isLoading ? (
            <p className="py-2 text-xs text-ink-muted">Buscando os itens...</p>
          ) : itens.error ? (
            <p className="py-2 text-xs text-danger">{mensagemErro(itens.error)}</p>
          ) : (
            <ul className="divide-y">
              {itens.data?.map((i) => (
                <li key={i.codprod} className="flex items-center gap-3 py-2">
                  <MiniFoto arquivo={i.arquivo} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8125rem] font-medium">{i.nome}</p>
                    <p className="truncate text-xs text-ink-muted">
                      Cód. Winthor {i.codprod}
                      {i.codigo && i.codigo !== String(i.codprod) && ` · EAN ${i.codigo}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums">
                      {i.valor === 0 ? "Bonificação" : formatarReais(i.valor)}
                    </p>
                    <p className="text-[0.6875rem] text-ink-subtle tabular-nums">
                      {i.qtd
                        ? `${i.qtd.toLocaleString("pt-BR")} un.${
                            i.valor > 0 ? ` × ${formatarReais(i.valor / i.qtd)}` : ""
                          }`
                        : "ainda não faturado"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

/** Foto do produto no histórico; sem foto (ou com o link quebrado), o ícone de pacote. */
function MiniFoto({ arquivo }: { arquivo: string | null }) {
  const [quebrada, setQuebrada] = useState(false);
  const foto = quebrada ? null : fotoUrl(arquivo);
  return (
    <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-sm bg-surface-sunken text-ink-subtle">
      {foto ? (
        <img
          src={foto}
          alt=""
          loading="lazy"
          onError={() => setQuebrada(true)}
          className="size-full object-contain"
        />
      ) : (
        <Package size={16} aria-hidden />
      )}
    </span>
  );
}
