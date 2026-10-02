"use client";

import { useState } from "react";
import { Ban, ChevronRight, CircleCheck, CirclePause, Users, type LucideIcon } from "lucide-react";

import { Badge, SearchInput } from "@/components/abastex";
import { CondicoesCliente } from "@/components/condicoes-cliente";
import { Paginacao } from "@/components/paginacao";
import { iniciais } from "@/lib/acessos";
import { formatarDocumento, paginaValida, POR_PAGINA, slugify } from "@/lib/catalogo";
import { mensagemErro } from "@/lib/erros";
import { cn } from "@/lib/utils";
import type { ClienteCarteira, SituacaoCliente } from "@/server/carteira";

type Filtro = "todos" | SituacaoCliente;

// Cada contador é também o filtro da lista: clicar em "Bloqueados" mostra só eles.
const CONTADORES: { valor: Filtro; rotulo: string; icone: LucideIcon; cor: string }[] = [
  { valor: "todos", rotulo: "Clientes", icone: Users, cor: "bg-brand-soft text-brand ring-brand" },
  {
    valor: "ativo",
    rotulo: "Ativos",
    icone: CircleCheck,
    cor: "bg-mint-soft text-mint-ink ring-mint-ink",
  },
  {
    valor: "bloqueado",
    rotulo: "Bloqueados",
    icone: Ban,
    cor: "bg-danger-soft text-danger ring-danger",
  },
  {
    valor: "inativo",
    rotulo: "Inativos",
    icone: CirclePause,
    cor: "bg-warning-soft text-warning ring-warning",
  },
];

const SITUACAO: Record<
  SituacaoCliente,
  { rotulo: string; tom: "success" | "danger" | "warning"; avatar: string }
> = {
  ativo: { rotulo: "Ativo", tom: "success", avatar: "bg-mint-soft text-mint-ink" },
  bloqueado: { rotulo: "Bloqueado", tom: "danger", avatar: "bg-danger-soft text-danger" },
  inativo: { rotulo: "Inativo", tom: "warning", avatar: "bg-warning-soft text-warning" },
};

// ponytail: a carteira inteira vem de uma vez (há uma com mais de 8 mil clientes) e
// busca, filtro e página são no navegador. Paginar no servidor se a carga ficar lenta.

/**
 * Carteira de clientes: contadores coloridos que filtram, busca e a lista. Tocar num
 * cliente abre as condições dele (crédito, títulos, bloqueio). Usada pelo vendedor
 * (Minha carteira) e pelo admin (carteira do vendedor, em Usuários).
 */
export function ListaCarteira({
  clientes,
  carregando,
  erro,
  comLink = false,
}: {
  clientes: ClienteCarteira[] | undefined;
  carregando: boolean;
  erro: unknown;
  /** Carteira do próprio vendedor: as condições oferecem o link do catálogo do cliente. */
  comLink?: boolean;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [aberto, setAberto] = useState(false);
  const [codcli, setCodcli] = useState<number | null>(null);

  const todos = clientes ?? [];
  const contagem: Record<Filtro, number> = {
    todos: todos.length,
    ativo: 0,
    bloqueado: 0,
    inativo: 0,
  };
  for (const c of todos) contagem[c.situacao]++;

  const palavras = slugify(busca).split("-").filter(Boolean);
  const filtrados = todos.filter(
    (c) =>
      (filtro === "todos" || c.situacao === filtro) &&
      palavras.every((p) => `${slugify(c.cliente)}-${c.codcli}-${c.cnpj ?? ""}`.includes(p)),
  );

  const inicio = paginaValida(pagina, filtrados.length) * POR_PAGINA;
  const visiveis = filtrados.slice(inicio, inicio + POR_PAGINA);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CONTADORES.map(({ valor, rotulo, icone: Icone, cor }) => (
          <button
            key={valor}
            type="button"
            onClick={() => {
              setFiltro(valor);
              setPagina(0);
            }}
            aria-pressed={filtro === valor}
            className={cn(
              "flex cursor-pointer flex-col items-start gap-1 rounded-2xl p-3 text-left transition",
              cor,
              filtro === valor ? "ring-2" : "opacity-75 hover:opacity-100",
            )}
          >
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
              <Icone className="size-4" aria-hidden />
              {rotulo}
            </span>
            <span className="text-2xl font-bold tabular-nums">
              {carregando ? "–" : contagem[valor].toLocaleString("pt-BR")}
            </span>
          </button>
        ))}
      </div>

      <SearchInput
        value={busca}
        onChange={(e) => {
          setBusca(e.target.value);
          setPagina(0);
        }}
        placeholder="Buscar por nome, código ou CNPJ"
        className="max-w-none"
      />

      {carregando && (
        <p className="py-10 text-center text-sm text-ink-muted">Carregando a carteira...</p>
      )}
      {!!erro && (
        <p className="rounded-xl bg-danger-soft p-4 text-sm text-danger">{mensagemErro(erro)}</p>
      )}

      <ul className="flex flex-col gap-2">
        {visiveis.map((c) => {
          const s = SITUACAO[c.situacao];
          return (
            <li key={c.codcli}>
              <button
                type="button"
                onClick={() => {
                  setCodcli(c.codcli);
                  setAberto(true);
                }}
                className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left transition hover:border-brand hover:bg-surface-hover"
                title="Ver crédito, títulos e bloqueio"
              >
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold uppercase",
                    s.avatar,
                  )}
                  aria-hidden
                >
                  {iniciais(c.cliente)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{c.cliente}</p>
                  <p className="truncate text-xs text-ink-muted">
                    Cód. <code>{c.codcli}</code>
                    {c.cnpj && <> · {formatarDocumento(c.cnpj)}</>}
                  </p>
                </div>
                <Badge tone={s.tom} dot>
                  {s.rotulo}
                </Badge>
                <ChevronRight
                  className="size-4 shrink-0 text-ink-subtle transition group-hover:translate-x-0.5 group-hover:text-brand"
                  aria-hidden
                />
              </button>
            </li>
          );
        })}
      </ul>

      <Paginacao pagina={pagina} total={filtrados.length} onMudar={setPagina} />
      {clientes && filtrados.length === 0 && (
        <p className="py-10 text-center text-sm text-ink-muted">
          {busca ? "Nenhum cliente encontrado." : "Nenhum cliente nessa situação."}
        </p>
      )}

      <CondicoesCliente
        codcli={codcli}
        comLink={comLink}
        aberto={aberto}
        onFechar={() => setAberto(false)}
      />
    </div>
  );
}
