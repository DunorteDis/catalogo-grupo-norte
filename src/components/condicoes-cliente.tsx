"use client";

import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  AlarmClock,
  Ban,
  CalendarClock,
  CalendarPlus,
  CircleCheck,
  CirclePause,
  HandCoins,
  Info,
  Landmark,
  PiggyBank,
  ReceiptText,
  ShoppingCart,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/abastex";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { iniciais } from "@/lib/acessos";
import { formatarDocumento } from "@/lib/catalogo";
import { chamar } from "@/lib/chamar";
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
import { condicoesCliente, type CondicoesCliente as Dados } from "@/server/carteira";

const COR_TITULO = {
  vencido: { borda: "border-l-danger", pill: "bg-danger-soft text-danger" },
  vence: { borda: "border-l-(--warning-fill)", pill: "bg-warning-soft text-warning" },
  "em-dia": { borda: "border-l-mint", pill: "bg-mint-soft text-mint-ink" },
} as const;

/**
 * Crédito, títulos e bloqueio do cliente, para decidir a venda a prazo. Usada na
 * carteira do vendedor, na carteira vista pelo admin e na tela de Clientes.
 */
export function CondicoesCliente({
  codcli,
  aberto,
  onFechar,
}: {
  codcli: number | null;
  aberto: boolean;
  onFechar: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["condicoes-cliente", codcli],
    queryFn: () => chamar(condicoesCliente(codcli!)),
    enabled: aberto && codcli != null,
  });

  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && onFechar()}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-3xl">
        {data ? (
          <Conteudo dados={data} />
        ) : (
          <div className="p-6">
            <DialogTitle>Condições do cliente</DialogTitle>
            <DialogDescription className="mt-1">
              {isLoading ? "Buscando crédito, títulos e bloqueio no Winthor..." : null}
            </DialogDescription>
            {error && (
              <p className="mt-4 rounded-xl bg-danger-soft p-4 text-sm text-danger">
                {mensagemErro(error)}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Conteudo({ dados }: { dados: Dados }) {
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
            <DialogTitle className="text-lg leading-tight">{c.nome}</DialogTitle>
            {c.razao !== c.nome && <p className="truncate text-sm text-ink-muted">{c.razao}</p>}
            <DialogDescription className="mt-1 text-xs">
              Cód. {c.codcli}
              {c.cnpj && ` · ${formatarDocumento(c.cnpj)}`}
              {c.cidade && ` · ${c.cidade}${c.uf ? `/${c.uf}` : ""}`}
            </DialogDescription>
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
      </header>

      <div className="flex flex-col gap-5 px-6 py-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
                  Acima do limite em <b className="text-danger">{formatarReais(-r.livre)}</b>.{" "}
                </>
              )}
              Crédito disponível é o limite menos os títulos em aberto; pedido ainda não faturado
              não entra.
            </p>
          </section>
        )}

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
            detalhe={c.ultimaCompra ? `há ${plural(diasDesde(c.ultimaCompra), "dia")}` : undefined}
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
                    <span className="text-sm font-bold tabular-nums">{formatarReais(t.saldo)}</span>
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
