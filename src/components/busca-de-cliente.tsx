"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Badge, SearchInput } from "@/components/abastex";
import { iniciais } from "@/lib/acessos";
import { formatarDocumento } from "@/lib/catalogo";
import { chamar } from "@/lib/chamar";
import { mensagemErro } from "@/lib/erros";
import { cn } from "@/lib/utils";
import { buscarClientes, type ClienteDaBusca } from "@/server/clientes";

/**
 * Busca nos clientes ativos do Winthor (todos, não só a carteira) e a lista para escolher
 * um. Usada para dizer de quem é a conversa e de quem é o pedido; nunca texto livre.
 */
export function BuscaDeCliente({
  ativo,
  desabilitado = false,
  onEscolher,
}: {
  /** Só busca com o diálogo aberto. */
  ativo: boolean;
  desabilitado?: boolean;
  onEscolher: (cliente: ClienteDaBusca) => void;
}) {
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTermo(busca.trim()), 350);
    return () => clearTimeout(t);
  }, [busca]);
  const clientes = useQuery({
    queryKey: ["buscar-clientes", termo],
    queryFn: () => chamar(buscarClientes(termo)),
    enabled: ativo && termo.length >= 2,
  });

  return (
    <>
      <SearchInput
        autoFocus
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Nome, código ou CNPJ"
      />
      <ul className="-mx-2 max-h-80 overflow-y-auto">
        {termo.length < 2 && (
          <li className="p-4 text-center text-sm text-ink-muted">
            Digite pelo menos 2 letras ou números.
          </li>
        )}
        {clientes.isFetching && !clientes.data && (
          <li className="p-4 text-center text-sm text-ink-muted">Buscando...</li>
        )}
        {clientes.error && (
          <li className="rounded-xl bg-danger-soft p-3 text-sm text-danger">
            {mensagemErro(clientes.error)}
          </li>
        )}
        {termo.length >= 2 && clientes.data?.length === 0 && (
          <li className="p-4 text-center text-sm text-ink-muted">Nenhum cliente ativo com isso.</li>
        )}
        {termo.length >= 2 &&
          clientes.data?.map((c) => (
            <li key={c.codcli}>
              <button
                type="button"
                disabled={desabilitado}
                onClick={() => onEscolher(c)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-hover disabled:cursor-wait"
              >
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold uppercase",
                    c.naCarteira ? "bg-mint-soft text-mint-ink" : "bg-info-soft text-info",
                  )}
                >
                  {iniciais(c.nome)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{c.nome}</span>
                    {c.naCarteira && <Badge tone="accent">sua carteira</Badge>}
                  </span>
                  <span className="block truncate text-xs text-ink-muted">
                    Cód. {c.codcli}
                    {c.cnpj && ` · ${formatarDocumento(c.cnpj)}`}
                    {c.cidade && ` · ${c.cidade}`}
                  </span>
                </span>
              </button>
            </li>
          ))}
      </ul>
    </>
  );
}
