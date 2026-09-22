import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Minus, Plus, Search, ShoppingCart, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useVendedorPublico } from "@/hooks/use-vendedor-publico";
import { MarcaCatalogo } from "@/components/marca-catalogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  filtrosBusca,
  fotoUrl,
  montarMensagem,
  whatsappNumero,
  type ItemCarrinho,
} from "@/lib/catalogo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/c/$slug/$distribuidora")({
  head: () => ({
    meta: [
      { title: "Catálogo de produtos — faça seu pedido" },
      {
        name: "description",
        content:
          "Escolha os produtos e as quantidades desejadas e envie seu pedido direto para o vendedor pelo WhatsApp.",
      },
      { property: "og:title", content: "Catálogo de produtos — faça seu pedido" },
      {
        property: "og:description",
        content: "Monte sua lista de produtos e envie o pedido pelo WhatsApp.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CatalogoPage,
});

const PAGE = 24;

type Produto = { id: string; codigo: string; nome: string; arquivo: string | null };

/**
 * Quantidade do item: dá para usar os botões − e + ou digitar direto. Quem pede
 * 30 unidades não vai clicar trinta vezes.
 */
function InputQtd({ qtd, onQtd }: { qtd: number; onQtd: (n: number) => void }) {
  const [texto, setTexto] = useState(String(qtd));

  // Mantém o campo em dia quando a quantidade muda por fora (botões, carrinho).
  useEffect(() => setTexto(String(qtd)), [qtd]);

  return (
    <input
      value={texto}
      inputMode="numeric"
      aria-label="Quantidade"
      className="w-12 border-0 bg-transparent p-0 text-center text-sm font-bold outline-none"
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const digitos = e.target.value.replace(/\D/g, "").slice(0, 4);
        setTexto(digitos);
        // Campo vazio ou zerado não tira o item na hora: senão ele some do meio
        // da digitação. Quem confirma o zero é o blur, logo abaixo.
        if (Number(digitos) > 0) onQtd(Number(digitos));
      }}
      onBlur={() => {
        if (Number(texto) > 0) return;
        onQtd(0);
      }}
    />
  );
}

/** Aba de seção: pílula na cor do catálogo quando aberta. */
function Aba({
  ativa,
  cor,
  onClick,
  children,
}: {
  ativa: boolean;
  cor: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-4 py-1.5 text-sm font-bold transition",
        ativa ? "text-white" : "bg-card text-muted-foreground hover:bg-muted",
      )}
      style={ativa ? { backgroundColor: cor, borderColor: cor } : undefined}
    >
      {children}
    </button>
  );
}

function CatalogoPage() {
  const { slug, distribuidora: distribuidoraSlug } = Route.useParams();
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  const [carrinho, setCarrinho] = useState<Record<string, ItemCarrinho>>({});
  const [aberto, setAberto] = useState(false);
  const [cliente, setCliente] = useState("");
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  // "" = aba Todos.
  const [secaoId, setSecaoId] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setTermo(busca.trim()), 350);
    return () => clearTimeout(t);
  }, [busca]);

  // Quem busca quer achar: a busca varre o catálogo inteiro, não só a aba aberta.
  useEffect(() => {
    if (termo) setSecaoId("");
  }, [termo]);

  const vendedorQuery = useVendedorPublico(slug);

  const distribuidoraQuery = useQuery({
    queryKey: ["distribuidora", distribuidoraSlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribuidoras")
        .select("id, nome, cor, emoji")
        .eq("slug", distribuidoraSlug)
        .eq("ativo", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const vendedor = vendedorQuery.data;
  const distribuidora = distribuidoraQuery.data;

  // As abas do catálogo. Catálogo sem seção nenhuma não mostra barra de abas.
  const secoesQuery = useQuery({
    queryKey: ["catalogo-secoes-publicas", distribuidora?.id],
    enabled: !!distribuidora?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogo_secoes")
        .select("id, nome")
        .eq("distribuidora_id", distribuidora!.id)
        .order("ordem")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const secoes = secoesQuery.data ?? [];

  const storageKey = `pedido:${slug}:${distribuidoraSlug}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setCarrinho(raw ? JSON.parse(raw) : {});
    } catch {
      /* ignora */
    }
  }, [storageKey]);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(carrinho));
    } catch {
      /* ignora */
    }
  }, [carrinho, storageKey]);

  const produtosQuery = useInfiniteQuery({
    queryKey: ["catalogo", distribuidora?.id, secaoId, termo],
    enabled: !!distribuidora?.id,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from("produtos")
        .select("id, codigo, nome, arquivo, distribuidora_produtos!inner(distribuidora_id)")
        .eq("distribuidora_produtos.distribuidora_id", distribuidora!.id)
        .eq("ativo", true)
        .order("nome", { ascending: true })
        // O ERP repete nome: sem desempate a rolagem repete um card e perde outro.
        .order("id")
        .range(pageParam * PAGE, pageParam * PAGE + PAGE - 1);
      if (secaoId) {
        q = q.eq("distribuidora_produtos.secao_id", secaoId);
      }
      for (const filtro of filtrosBusca(termo)) {
        q = q.or(filtro);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Produto[];
    },
    getNextPageParam: (last, pages) => (last.length === PAGE ? pages.length : undefined),
  });

  const produtos = useMemo(() => produtosQuery.data?.pages.flat() ?? [], [produtosQuery.data]);
  const itens = Object.values(carrinho);
  const totalItens = itens.reduce((s, i) => s + i.quantidade, 0);
  const cor = distribuidora?.cor || "#b73d25";

  function setQtd(p: Produto, qtd: number) {
    setCarrinho((atual) => {
      const novo = { ...atual };
      if (qtd <= 0) delete novo[p.id];
      else
        novo[p.id] = {
          produto_id: p.id,
          codigo: p.codigo,
          nome: p.nome,
          arquivo: p.arquivo,
          quantidade: qtd,
        };
      return novo;
    });
  }

  async function concluir() {
    if (!vendedor || !distribuidora || itens.length === 0) return;
    setEnviando(true);
    try {
      const pedidoId = crypto.randomUUID();
      const { error } = await supabase.from("pedidos").insert({
        id: pedidoId,
        vendedor_id: vendedor.id,
        distribuidora_id: distribuidora.id,
        cliente_nome: cliente.trim() || null,
        observacao: observacao.trim() || null,
        total_itens: totalItens,
      });
      if (error) throw error;
      await supabase.from("pedido_itens").insert(
        itens.map((i) => ({
          pedido_id: pedidoId,
          codigo: i.codigo,
          nome: i.nome,
          quantidade: i.quantidade,
        })),
      );
      const texto = montarMensagem({
        distribuidora: distribuidora.nome,
        clienteNome: cliente,
        observacao,
        itens,
      });
      const url = `https://wa.me/${whatsappNumero(vendedor.whatsapp)}?text=${encodeURIComponent(texto)}`;
      setCarrinho({});
      // noopener: sem isso a aba do WhatsApp recebe window.opener e pode trocar esta pagina
      window.open(url, "_blank", "noopener");
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível enviar o pedido. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  if (vendedorQuery.isLoading || distribuidoraQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!vendedor || !distribuidora) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-extrabold">Link não encontrado</h1>
        <p className="text-sm text-muted-foreground">Peça um novo link para o seu vendedor.</p>
        <Link to="/" className="text-sm font-semibold underline">
          Ir para o início
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <MarcaCatalogo
            marca={{
              slug: distribuidoraSlug,
              nome: distribuidora.nome,
              cor,
              emoji: distribuidora.emoji,
            }}
            logoClassName="h-10 max-w-[150px]"
            className="text-lg"
          />
          <div className="ml-auto text-right">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Vendedor</p>
            <p className="text-sm font-semibold leading-tight">{vendedor.nome}</p>
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto ou código"
              className="h-12 rounded-xl pl-9 text-base"
            />
          </div>
        </div>

        {secoes.length > 0 && (
          <div className="mx-auto max-w-5xl overflow-x-auto px-4 pb-3">
            <div className="flex w-max gap-2">
              <Aba ativa={!secaoId} cor={cor} onClick={() => setSecaoId("")}>
                Todos
              </Aba>
              {secoes.map((s) => (
                <Aba key={s.id} ativa={secaoId === s.id} cor={cor} onClick={() => setSecaoId(s.id)}>
                  {s.nome}
                </Aba>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-5xl px-4 py-4">
        {produtosQuery.isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : produtos.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Nenhum produto encontrado.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {produtos.map((p) => {
              const qtd = carrinho[p.id]?.quantidade ?? 0;
              const foto = fotoUrl(p.arquivo);
              return (
                <div
                  key={p.id}
                  className="flex flex-col overflow-hidden rounded-2xl border bg-card"
                >
                  <div className="flex aspect-square items-center justify-center bg-muted/40 p-3">
                    {foto ? (
                      <img
                        src={foto}
                        alt={p.nome}
                        loading="lazy"
                        className="h-full w-full object-contain"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                        }}
                      />
                    ) : (
                      <span className="px-2 text-center text-xs text-muted-foreground">
                        Sem foto
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <p className="line-clamp-3 text-xs font-semibold leading-snug">{p.nome}</p>
                    <p className="text-[11px] text-muted-foreground">Cód. {p.codigo}</p>
                    <div className="mt-auto">
                      {qtd === 0 ? (
                        <Button
                          size="sm"
                          className="w-full rounded-xl text-white hover:opacity-90"
                          style={{ backgroundColor: cor }}
                          onClick={() => setQtd(p, 1)}
                        >
                          Adicionar
                        </Button>
                      ) : (
                        <div className="flex items-center justify-between rounded-xl border p-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => setQtd(p, qtd - 1)}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <InputQtd qtd={qtd} onQtd={(n) => setQtd(p, n)} />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => setQtd(p, qtd + 1)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {produtosQuery.hasNextPage && (
          <div className="flex justify-center py-6">
            <Button
              variant="outline"
              onClick={() => produtosQuery.fetchNextPage()}
              disabled={produtosQuery.isFetchingNextPage}
            >
              {produtosQuery.isFetchingNextPage ? "Carregando..." : "Carregar mais produtos"}
            </Button>
          </div>
        )}
      </main>

      {totalItens > 0 && !aberto && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card p-3">
          <div className="mx-auto max-w-5xl">
            <Button
              className="h-14 w-full rounded-xl text-base font-bold text-white hover:opacity-90"
              style={{ backgroundColor: cor }}
              onClick={() => setAberto(true)}
            >
              <ShoppingCart className="mr-2 h-5 w-5" />
              Ver pedido ({totalItens} {totalItens === 1 ? "item" : "itens"})
            </Button>
          </div>
        </div>
      )}

      {aberto && (
        <div className="fixed inset-0 z-40 flex flex-col bg-background">
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <h2 className="text-lg font-extrabold">Seu pedido</h2>
            <Button
              size="icon"
              variant="ghost"
              className="ml-auto"
              onClick={() => setAberto(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {itens.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Seu pedido está vazio.
              </p>
            ) : (
              <ul className="space-y-2">
                {itens.map((i) => (
                  <li key={i.produto_id} className="flex items-center gap-3 rounded-xl border p-2">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted/40">
                      {fotoUrl(i.arquivo) && (
                        <img
                          src={fotoUrl(i.arquivo)!}
                          alt={i.nome}
                          className="h-full w-full object-contain"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-xs font-semibold">{i.nome}</p>
                      <p className="text-[11px] text-muted-foreground">Cód. {i.codigo}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() =>
                          setQtd(
                            {
                              id: i.produto_id,
                              codigo: i.codigo,
                              nome: i.nome,
                              arquivo: i.arquivo,
                            },
                            i.quantidade - 1,
                          )
                        }
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <InputQtd
                        qtd={i.quantidade}
                        onQtd={(n) =>
                          setQtd(
                            {
                              id: i.produto_id,
                              codigo: i.codigo,
                              nome: i.nome,
                              arquivo: i.arquivo,
                            },
                            n,
                          )
                        }
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() =>
                          setQtd(
                            {
                              id: i.produto_id,
                              codigo: i.codigo,
                              nome: i.nome,
                              arquivo: i.arquivo,
                            },
                            i.quantidade + 1,
                          )
                        }
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        onClick={() =>
                          setQtd(
                            {
                              id: i.produto_id,
                              codigo: i.codigo,
                              nome: i.nome,
                              arquivo: i.arquivo,
                            },
                            0,
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 space-y-3">
              <Input
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                placeholder="Seu nome (opcional)"
                className="h-12 rounded-xl"
              />
              <Textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Observação (opcional)"
                className="rounded-xl"
              />
            </div>
          </div>
          <div className="border-t p-3">
            <Button
              className="h-14 w-full rounded-xl text-base font-bold text-white hover:opacity-90"
              style={{ backgroundColor: cor }}
              disabled={itens.length === 0 || enviando}
              onClick={concluir}
            >
              {enviando ? "Enviando..." : "Concluir pedido no WhatsApp"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
