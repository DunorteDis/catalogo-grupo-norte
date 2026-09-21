import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { mensagemErro } from "@/lib/erros";
import { fotoUrl } from "@/lib/catalogo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/catalogo")({
  component: CatalogoPage,
});

const PAGINA = 25;
const LOTE = 500;

type Produto = { id: string; codigo: string; nome: string; arquivo: string | null };

function buscaOr(termo: string) {
  return `nome.ilike.%${termo}%,codigo.ilike.%${termo}%`;
}

function useDebounce(valor: string, ms = 350) {
  const [saida, setSaida] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setSaida(valor.trim()), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return saida;
}

function LinhaProduto({ produto, acao }: { produto: Produto; acao: React.ReactNode }) {
  const foto = fotoUrl(produto.arquivo);
  return (
    <li className="flex items-center gap-3 p-3">
      <div className="size-12 shrink-0 overflow-hidden rounded-lg border bg-muted/40">
        {foto && <img src={foto} alt="" loading="lazy" className="h-full w-full object-contain" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{produto.nome}</p>
        <p className="font-mono text-xs text-muted-foreground">{produto.codigo}</p>
      </div>
      {acao}
    </li>
  );
}

function CatalogoPage() {
  const qc = useQueryClient();
  const [distribuidoraId, setDistribuidoraId] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const termo = useDebounce(busca);

  const [adicionarAberto, setAdicionarAberto] = useState(false);
  const [buscaAdd, setBuscaAdd] = useState("");
  const [paginaAdd, setPaginaAdd] = useState(0);
  const termoAdd = useDebounce(buscaAdd);

  useEffect(() => setPagina(0), [termo, distribuidoraId]);
  useEffect(() => setPaginaAdd(0), [termoAdd]);

  const distribuidorasQuery = useQuery({
    queryKey: ["admin-distribuidoras"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribuidoras")
        .select("id, nome, slug")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  // O catálogo em si: parte do vínculo e traz o produto embutido com !inner, para
  // a busca e a contagem valerem sobre o que está no catálogo, não sobre o cadastro.
  const catalogoQuery = useQuery({
    queryKey: ["catalogo-itens", distribuidoraId, termo, pagina],
    enabled: !!distribuidoraId,
    queryFn: async () => {
      let q = supabase
        .from("distribuidora_produtos")
        .select("produtos!inner(id, codigo, nome, arquivo)", { count: "exact" })
        .eq("distribuidora_id", distribuidoraId)
        .order("nome", { referencedTable: "produtos" })
        .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);
      if (termo) q = q.or(buscaOr(termo), { referencedTable: "produtos" });
      const { data, error, count } = await q;
      if (error) throw error;
      return {
        linhas: (data ?? []).map((v) => v.produtos as unknown as Produto),
        total: count ?? 0,
      };
    },
  });

  // Cadastro completo, só dentro do modal de adicionar.
  const cadastroQuery = useQuery({
    queryKey: ["catalogo-cadastro", termoAdd, paginaAdd],
    enabled: adicionarAberto,
    queryFn: async () => {
      let q = supabase
        .from("produtos")
        .select("id, codigo, nome, arquivo", { count: "exact" })
        .order("nome")
        .range(paginaAdd * PAGINA, paginaAdd * PAGINA + PAGINA - 1);
      if (termoAdd) q = q.or(buscaOr(termoAdd));
      const { data, error, count } = await q;
      if (error) throw error;
      return { linhas: (data ?? []) as Produto[], total: count ?? 0 };
    },
  });

  const idsVisiveisNoModal = (cadastroQuery.data?.linhas ?? []).map((p) => p.id);

  const jaNoCatalogoQuery = useQuery({
    queryKey: ["catalogo-ja-tem", distribuidoraId, idsVisiveisNoModal],
    enabled: adicionarAberto && !!distribuidoraId && idsVisiveisNoModal.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribuidora_produtos")
        .select("produto_id")
        .eq("distribuidora_id", distribuidoraId)
        .in("produto_id", idsVisiveisNoModal);
      if (error) throw error;
      return new Set((data ?? []).map((v) => v.produto_id));
    },
  });

  function recarregar() {
    qc.invalidateQueries({ queryKey: ["catalogo-itens"] });
    qc.invalidateQueries({ queryKey: ["catalogo-ja-tem"] });
  }

  const adicionar = useMutation({
    mutationFn: async (ids: string[]) => {
      for (let i = 0; i < ids.length; i += LOTE) {
        const { error } = await supabase.from("distribuidora_produtos").upsert(
          ids.slice(i, i + LOTE).map((produto_id) => ({
            distribuidora_id: distribuidoraId,
            produto_id,
          })),
          { onConflict: "distribuidora_id,produto_id" },
        );
        if (error) throw error;
      }
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} ${n === 1 ? "produto adicionado" : "produtos adicionados"} ao catálogo.`);
      recarregar();
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const remover = useMutation({
    mutationFn: async (ids: string[]) => {
      for (let i = 0; i < ids.length; i += LOTE) {
        const { error } = await supabase
          .from("distribuidora_produtos")
          .delete()
          .eq("distribuidora_id", distribuidoraId)
          .in("produto_id", ids.slice(i, i + LOTE));
        if (error) throw error;
      }
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} ${n === 1 ? "produto removido" : "produtos removidos"} do catálogo.`);
      recarregar();
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  /** Ids de todos os produtos que a busca devolve, em páginas de 1000. */
  async function todosOsIds(dentroDoCatalogo: boolean, filtro: string) {
    const ids: string[] = [];
    for (let de = 0; ; de += 1000) {
      const q = dentroDoCatalogo
        ? supabase
            .from("distribuidora_produtos")
            .select("produto_id, produtos!inner(nome, codigo)")
            .eq("distribuidora_id", distribuidoraId)
            .range(de, de + 999)
        : supabase
            .from("produtos")
            .select("id")
            .order("nome")
            .range(de, de + 999);
      const comFiltro = filtro
        ? dentroDoCatalogo
          ? q.or(buscaOr(filtro), { referencedTable: "produtos" })
          : (q as ReturnType<typeof supabase.from>).or(buscaOr(filtro))
        : q;
      const { data, error } = await comFiltro;
      if (error) throw error;
      const lote = (data ?? []) as Array<{ produto_id?: string; id?: string }>;
      ids.push(...lote.map((x) => (dentroDoCatalogo ? x.produto_id! : x.id!)));
      if (lote.length < 1000) break;
    }
    return ids;
  }

  const total = catalogoQuery.data?.total ?? 0;
  const totalAdd = cadastroQuery.data?.total ?? 0;
  const escolhida = distribuidorasQuery.data?.find((d) => d.id === distribuidoraId);
  const ocupado = adicionar.isPending || remover.isPending;

  return (
    <div>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold">Catálogos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            O que cada distribuidora mostra ao cliente. Adicione a partir do cadastro de produtos.
          </p>
        </div>
        {distribuidoraId && (
          <Button
            className="h-11 rounded-xl font-bold"
            onClick={() => {
              setBuscaAdd("");
              setAdicionarAberto(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Adicionar produtos
          </Button>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4">
        <Select value={distribuidoraId} onValueChange={setDistribuidoraId}>
          <SelectTrigger className="h-11 w-64 rounded-xl">
            <SelectValue placeholder="Escolha a distribuidora" />
          </SelectTrigger>
          <SelectContent>
            {(distribuidorasQuery.data ?? []).map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {escolhida && (
          <span className="rounded-xl bg-primary-soft px-3 py-2 text-sm font-bold text-primary">
            {termo ? `${total} na busca` : `${total} no catálogo`}
          </span>
        )}
        {(catalogoQuery.isFetching || ocupado) && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {!distribuidoraId ? (
        <p className="mt-6 rounded-2xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          Escolha uma distribuidora para ver e montar o catálogo dela.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar no catálogo"
              className="h-11 max-w-md rounded-xl"
            />
            {total > 0 && (
              <Button
                variant="outline"
                className="ml-auto rounded-xl text-destructive"
                disabled={ocupado}
                onClick={async () => {
                  const alvo = termo ? `os ${total} da busca` : `todos os ${total}`;
                  if (!window.confirm(`Remover ${alvo} do catálogo ${escolhida?.nome}?`)) return;
                  remover.mutate(await todosOsIds(true, termo));
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remover {total}
              </Button>
            )}
          </div>

          <ul className="mt-4 divide-y rounded-2xl border bg-card">
            {(catalogoQuery.data?.linhas ?? []).map((p) => (
              <LinhaProduto
                key={p.id}
                produto={p}
                acao={
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive"
                    disabled={ocupado}
                    onClick={() => remover.mutate([p.id])}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                }
              />
            ))}
            {!catalogoQuery.isLoading && total === 0 && (
              <p className="p-12 text-center text-sm text-muted-foreground">
                {termo
                  ? "Nenhum produto do catálogo bate com essa busca."
                  : "Catálogo vazio. Use “Adicionar produtos” para montá-lo."}
              </p>
            )}
          </ul>

          {total > PAGINA && (
            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="outline"
                disabled={pagina === 0}
                onClick={() => setPagina((p) => Math.max(0, p - 1))}
              >
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">
                Página {pagina + 1} de {Math.ceil(total / PAGINA)}
              </span>
              <Button
                variant="outline"
                disabled={(pagina + 1) * PAGINA >= total}
                onClick={() => setPagina((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={adicionarAberto} onOpenChange={setAdicionarAberto}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Adicionar ao catálogo {escolhida?.nome}</DialogTitle>
            <DialogDescription>
              Busque no cadastro de produtos e adicione um a um ou a busca inteira.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={buscaAdd}
              onChange={(e) => setBuscaAdd(e.target.value)}
              placeholder="Buscar por nome ou código"
              className="h-11 flex-1 rounded-xl"
            />
            <Button
              variant="outline"
              className="rounded-xl"
              disabled={ocupado || totalAdd === 0}
              onClick={async () => adicionar.mutate(await todosOsIds(false, termoAdd))}
            >
              <Plus className="mr-2 h-4 w-4" />
              Adicionar {totalAdd}
            </Button>
          </div>

          <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-xl border">
            {(cadastroQuery.data?.linhas ?? []).map((p) => {
              const jaTem = jaNoCatalogoQuery.data?.has(p.id) ?? false;
              return (
                <LinhaProduto
                  key={p.id}
                  produto={p}
                  acao={
                    jaTem ? (
                      <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">
                        <Check className="h-3.5 w-3.5" />
                        No catálogo
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl"
                        disabled={ocupado || jaNoCatalogoQuery.isLoading}
                        onClick={() => adicionar.mutate([p.id])}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Adicionar
                      </Button>
                    )
                  }
                />
              );
            })}
            {!cadastroQuery.isLoading && totalAdd === 0 && (
              <p className="p-10 text-center text-sm text-muted-foreground">
                Nenhum produto encontrado.
              </p>
            )}
          </ul>

          <DialogFooter className="sm:justify-between">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={paginaAdd === 0}
                onClick={() => setPaginaAdd((p) => Math.max(0, p - 1))}
              >
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">
                {totalAdd} {totalAdd === 1 ? "produto" : "produtos"}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={(paginaAdd + 1) * PAGINA >= totalAdd}
                onClick={() => setPaginaAdd((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
            <Button type="button" onClick={() => setAdicionarAberto(false)}>
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
