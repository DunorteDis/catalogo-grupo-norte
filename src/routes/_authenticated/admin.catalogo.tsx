import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { mensagemErro } from "@/lib/erros";
import { filtrosBusca, fotoUrl, MAX_CODIGOS_COLADOS, parseCodigos, slugify } from "@/lib/catalogo";
import { MarcaCatalogo } from "@/components/marca-catalogo";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/catalogo")({
  component: CatalogoPage,
});

const PAGINA = 25;
const LOTE = 500;
// Busca por código vai na URL (PostgREST usa GET): lote menor para o `in` não
// estourar o limite de tamanho da requisição.
const LOTE_BUSCA = 200;
const COR_PADRAO = "#b73d25";
const EMOJIS = ["🔥", "⭐", "🎁", "🛒", "💥", "🏷️", "🧴", "☀️", "🎄", "🥤"];

type Produto = { id: string; codigo: string; nome: string; arquivo: string | null };
type Secao = { id: string; nome: string; ordem: number };
type ItemDoCatalogo = { produto: Produto; secaoId: string | null };
type Catalogo = {
  id: string;
  nome: string;
  slug: string;
  cor: string;
  emoji: string | null;
  personalizado: boolean;
  ativo: boolean;
};

function useDebounce(valor: string, ms = 350) {
  const [saida, setSaida] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setSaida(valor.trim()), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return saida;
}

/**
 * Liga produtos a um catálogo, em lotes, sem duplicar o que já está lá. Como o
 * upsert também grava a seção, religar um produto que já estava no catálogo é o
 * que move ele de aba — não precisa remover e adicionar de novo.
 */
async function vincular(catalogoId: string, ids: string[], secaoId: string | null = null) {
  for (let i = 0; i < ids.length; i += LOTE) {
    const { error } = await supabase.from("distribuidora_produtos").upsert(
      ids.slice(i, i + LOTE).map((produto_id) => ({
        distribuidora_id: catalogoId,
        produto_id,
        secao_id: secaoId,
      })),
      { onConflict: "distribuidora_id,produto_id" },
    );
    if (error) throw error;
  }
}

function LinhaProduto({
  produto,
  etiqueta,
  acao,
}: {
  produto: Produto;
  etiqueta?: React.ReactNode;
  acao: React.ReactNode;
}) {
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
      {etiqueta}
      {acao}
    </li>
  );
}

function Aba({
  ativa,
  onClick,
  children,
}: {
  ativa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-4 py-1.5 text-sm font-bold transition",
        ativa
          ? "border-transparent bg-primary text-primary-foreground"
          : "bg-card text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function CatalogoPage() {
  const qc = useQueryClient();
  const [catalogoId, setCatalogoId] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const termo = useDebounce(busca);

  const [adicionarAberto, setAdicionarAberto] = useState(false);
  const [buscaAdd, setBuscaAdd] = useState("");
  const [paginaAdd, setPaginaAdd] = useState(0);
  const termoAdd = useDebounce(buscaAdd);

  const [criarAberto, setCriarAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [emoji, setEmoji] = useState("🔥");
  const [cor, setCor] = useState(COR_PADRAO);
  const [copiarDe, setCopiarDe] = useState("");

  const [colarAberto, setColarAberto] = useState(false);
  const [textoCodigos, setTextoCodigos] = useState("");
  const [naoEncontrados, setNaoEncontrados] = useState<string[]>([]);

  // "" = aba Todos. A seção escolhida filtra a lista e é o destino do que entrar.
  const [secaoId, setSecaoId] = useState("");
  const [secaoDialog, setSecaoDialog] = useState<"criar" | "renomear" | null>(null);
  const [nomeSecao, setNomeSecao] = useState("");
  const [excluirSecaoAberto, setExcluirSecaoAberto] = useState(false);

  useEffect(() => setPagina(0), [termo, catalogoId, secaoId]);
  useEffect(() => setSecaoId(""), [catalogoId]);
  useEffect(() => setPaginaAdd(0), [termoAdd]);

  // Distribuidoras e catálogos personalizados moram na mesma tabela: mesma forma
  // (nome, slug, cor, lista de produtos, link público), só muda a marca.
  const catalogosQuery = useQuery({
    queryKey: ["catalogos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribuidoras")
        .select("id, nome, slug, cor, emoji, personalizado, ativo")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Catalogo[];
    },
  });

  const catalogos = catalogosQuery.data ?? [];
  const distribuidoras = catalogos.filter((c) => !c.personalizado);
  const personalizados = catalogos.filter((c) => c.personalizado);
  const catalogo = catalogos.find((c) => c.id === catalogoId);

  const secoesQuery = useQuery({
    queryKey: ["catalogo-secoes", catalogoId],
    enabled: !!catalogoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogo_secoes")
        .select("id, nome, ordem")
        .eq("distribuidora_id", catalogoId)
        .order("ordem")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Secao[];
    },
  });

  const secoes = secoesQuery.data ?? [];
  const secao = secoes.find((s) => s.id === secaoId);
  const nomePorSecao = new Map(secoes.map((s) => [s.id, s.nome]));

  // O catálogo em si: parte do vínculo e traz o produto embutido com !inner, para
  // a busca e a contagem valerem sobre o que está no catálogo, não sobre o cadastro.
  const catalogoQuery = useQuery({
    queryKey: ["catalogo-itens", catalogoId, secaoId, termo, pagina],
    enabled: !!catalogoId,
    queryFn: async () => {
      let q = supabase
        .from("distribuidora_produtos")
        .select("secao_id, produtos!inner(id, codigo, nome, arquivo)", { count: "exact" })
        .eq("distribuidora_id", catalogoId)
        .order("nome", { referencedTable: "produtos" })
        .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);
      if (secaoId) q = q.eq("secao_id", secaoId);
      for (const condicao of filtrosBusca(termo)) {
        q = q.or(condicao, { referencedTable: "produtos" });
      }
      const { data, error, count } = await q;
      if (error) throw error;
      return {
        linhas: (data ?? []).map((v) => ({
          produto: v.produtos as unknown as Produto,
          secaoId: v.secao_id,
        })) as ItemDoCatalogo[],
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
      for (const condicao of filtrosBusca(termoAdd)) {
        q = q.or(condicao);
      }
      const { data, error, count } = await q;
      if (error) throw error;
      return { linhas: (data ?? []) as Produto[], total: count ?? 0 };
    },
  });

  const codigosVisiveisNoModal = (cadastroQuery.data?.linhas ?? []).map((p) => p.codigo);

  /**
   * O que o catálogo já tem, olhando por CÓDIGO e não por cadastro. O cadastro
   * espelha o ERP, onde o mesmo EAN aparece em mais de uma linha; somar as duas
   * poria dois cards iguais na frente do cliente. Guarda também qual cadastro
   * está ligado, para "Mover para cá" mexer nesse vínculo em vez de criar outro.
   */
  const jaNoCatalogoQuery = useQuery({
    queryKey: ["catalogo-ja-tem", catalogoId, codigosVisiveisNoModal],
    enabled: adicionarAberto && !!catalogoId && codigosVisiveisNoModal.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribuidora_produtos")
        .select("produto_id, secao_id, produtos!inner(codigo)")
        .eq("distribuidora_id", catalogoId)
        .in("produtos.codigo", codigosVisiveisNoModal);
      if (error) throw error;
      const porCodigo = new Map<string, { produtoId: string; secaoId: string | null }>();
      for (const v of data ?? []) {
        const codigo = (v.produtos as unknown as { codigo: string }).codigo;
        if (!porCodigo.has(codigo)) {
          porCodigo.set(codigo, { produtoId: v.produto_id, secaoId: v.secao_id });
        }
      }
      return porCodigo;
    },
  });

  function recarregar() {
    qc.invalidateQueries({ queryKey: ["catalogo-itens"] });
    qc.invalidateQueries({ queryKey: ["catalogo-ja-tem"] });
  }

  const adicionar = useMutation({
    mutationFn: async (ids: string[]) => {
      await vincular(catalogoId, ids, secaoId || null);
      return ids.length;
    },
    onSuccess: (n) => {
      const onde = secao ? `à seção ${secao.nome}` : "ao catálogo";
      toast.success(`${n} ${n === 1 ? "produto adicionado" : "produtos adicionados"} ${onde}.`);
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
          .eq("distribuidora_id", catalogoId)
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

  /**
   * Ids de todos os produtos que a busca devolve, em páginas de 1000. Dentro do
   * catálogo a aba aberta também filtra — "Remover os N" tira o que está à vista.
   */
  async function todosOsIds(dentroDoCatalogo: boolean, filtro: string) {
    const ids: string[] = [];
    // Um EAN tem mais de um cadastro (o banco espelha o ERP); fica o primeiro,
    // senão "Adicionar os N" enche o catálogo de card repetido.
    const codigosJaPegos = new Set<string>();
    for (let de = 0; ; de += 1000) {
      let lote: Array<{ produto_id?: string; id?: string; codigo?: string }>;
      if (dentroDoCatalogo) {
        let q = supabase
          .from("distribuidora_produtos")
          .select("produto_id, produtos!inner(nome, codigo)")
          .eq("distribuidora_id", catalogoId)
          .order("produto_id")
          .range(de, de + 999);
        if (secaoId) q = q.eq("secao_id", secaoId);
        for (const condicao of filtrosBusca(filtro)) {
          q = q.or(condicao, { referencedTable: "produtos" });
        }
        const { data, error } = await q;
        if (error) throw error;
        lote = data ?? [];
      } else {
        let q = supabase
          .from("produtos")
          .select("id, codigo")
          .order("created_at")
          .range(de, de + 999);
        for (const condicao of filtrosBusca(filtro)) {
          q = q.or(condicao);
        }
        const { data, error } = await q;
        if (error) throw error;
        lote = data ?? [];
      }
      for (const x of lote) {
        if (dentroDoCatalogo) {
          ids.push(x.produto_id!);
          continue;
        }
        if (codigosJaPegos.has(x.codigo!)) continue;
        codigosJaPegos.add(x.codigo!);
        ids.push(x.id!);
      }
      if (lote.length < 1000) break;
    }
    return ids;
  }

  /** Duplica catálogo: as seções nascem de novo no destino e os vínculos vão para a seção equivalente. */
  async function copiarCatalogo(origemId: string, destinoId: string) {
    const { data: origem, error } = await supabase
      .from("catalogo_secoes")
      .select("id, nome, ordem")
      .eq("distribuidora_id", origemId)
      .order("ordem");
    if (error) throw error;

    const equivalente = new Map<string, string>();
    if (origem?.length) {
      const { data: criadas, error: erroSecoes } = await supabase
        .from("catalogo_secoes")
        .insert(origem.map((s) => ({ distribuidora_id: destinoId, nome: s.nome, ordem: s.ordem })))
        .select("id, nome");
      if (erroSecoes) throw erroSecoes;
      const porNome = new Map((criadas ?? []).map((s) => [s.nome, s.id]));
      origem.forEach((s) => equivalente.set(s.id, porNome.get(s.nome)!));
    }

    for (let de = 0; ; de += 1000) {
      const { data, error: erroVinculos } = await supabase
        .from("distribuidora_produtos")
        .select("produto_id, secao_id")
        .eq("distribuidora_id", origemId)
        .order("produto_id")
        .range(de, de + 999);
      if (erroVinculos) throw erroVinculos;
      const lote = data ?? [];
      if (lote.length > 0) {
        const { error: erroCopia } = await supabase.from("distribuidora_produtos").upsert(
          lote.map((v) => ({
            distribuidora_id: destinoId,
            produto_id: v.produto_id,
            secao_id: v.secao_id ? (equivalente.get(v.secao_id) ?? null) : null,
          })),
          { onConflict: "distribuidora_id,produto_id" },
        );
        if (erroCopia) throw erroCopia;
      }
      if (lote.length < 1000) break;
    }
  }

  const novoSlug = slugify(nome);

  const criar = useMutation({
    mutationFn: async () => {
      const limpo = nome.trim();
      if (!limpo || !novoSlug) throw new Error("Dê um nome ao catálogo.");
      const { data, error } = await supabase
        .from("distribuidoras")
        .insert({
          nome: limpo,
          slug: novoSlug,
          cor,
          emoji: emoji.trim() || null,
          personalizado: true,
        })
        .select("id, nome, slug, cor, emoji, personalizado, ativo")
        .single();
      if (error) throw error;
      if (copiarDe) await copiarCatalogo(copiarDe, data.id);
      return data as Catalogo;
    },
    onSuccess: (novo) => {
      toast.success(`Catálogo ${novo.nome} criado.`);
      setCriarAberto(false);
      setNome("");
      setCopiarDe("");
      setCor(COR_PADRAO);
      qc.invalidateQueries({ queryKey: ["catalogos"] });
      setCatalogoId(novo.id);
      recarregar();
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const colar = useMutation({
    mutationFn: async () => {
      const codigos = parseCodigos(textoCodigos);
      if (codigos.length === 0) throw new Error("Cole ao menos um código.");
      if (codigos.length > MAX_CODIGOS_COLADOS)
        throw new Error(
          `Cole no máximo ${MAX_CODIGOS_COLADOS} códigos por vez — vieram ${codigos.length}.`,
        );
      const achados = new Map<string, string>();
      let repetidos = 0;
      for (let i = 0; i < codigos.length; i += LOTE_BUSCA) {
        const { data, error } = await supabase
          .from("produtos")
          .select("id, codigo, created_at")
          .in("codigo", codigos.slice(i, i + LOTE_BUSCA))
          .order("created_at");
        if (error) throw error;
        // O cadastro espelha o ERP linha a linha, então o mesmo código pode ter
        // mais de um registro. Colar 100 códigos tem que dar 100 produtos: fica
        // o cadastro mais antigo, que é o que o ERP tem como versão atual.
        (data ?? []).forEach((p) => {
          if (achados.has(p.codigo)) repetidos++;
          else achados.set(p.codigo, p.id);
        });
      }
      await vincular(catalogoId, [...achados.values()], secaoId || null);
      return {
        total: achados.size,
        repetidos,
        faltando: codigos.filter((c) => !achados.has(c)),
      };
    },
    onSuccess: ({ total, repetidos, faltando }) => {
      toast.success(
        `${total} ${total === 1 ? "produto vinculado" : "produtos vinculados"}` +
          (faltando.length ? ` · ${faltando.length} sem cadastro` : "") +
          (repetidos ? ` · ${repetidos} cadastro(s) repetido(s) ignorado(s)` : "") +
          ".",
      );
      setNaoEncontrados(faltando);
      setTextoCodigos("");
      if (faltando.length === 0) setColarAberto(false);
      recarregar();
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const alternarAtivo = useMutation({
    mutationFn: async (ativo: boolean) => {
      const { error } = await supabase
        .from("distribuidoras")
        .update({ ativo })
        .eq("id", catalogoId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalogos"] }),
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const excluir = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("distribuidoras").delete().eq("id", catalogoId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Catálogo excluído.");
      setCatalogoId("");
      qc.invalidateQueries({ queryKey: ["catalogos"] });
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  function recarregarSecoes() {
    qc.invalidateQueries({ queryKey: ["catalogo-secoes", catalogoId] });
    recarregar();
  }

  const criarSecao = useMutation({
    mutationFn: async (nomeSecao: string) => {
      const { data, error } = await supabase
        .from("catalogo_secoes")
        .insert({ distribuidora_id: catalogoId, nome: nomeSecao, ordem: secoes.length })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      toast.success("Seção criada. O que você adicionar agora cai nela.");
      recarregarSecoes();
      setSecaoId(id);
      setSecaoDialog(null);
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const renomearSecao = useMutation({
    mutationFn: async (nomeNovo: string) => {
      const { error } = await supabase
        .from("catalogo_secoes")
        .update({ nome: nomeNovo })
        .eq("id", secaoId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Seção renomeada.");
      recarregarSecoes();
      setSecaoDialog(null);
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const moverSecao = useMutation({
    mutationFn: async (direcao: -1 | 1) => {
      const i = secoes.findIndex((s) => s.id === secaoId);
      const atual = secoes[i];
      const vizinho = secoes[i + direcao];
      if (!atual || !vizinho) return;
      const nova = [...secoes];
      nova[i] = vizinho;
      nova[i + direcao] = atual;
      // ponytail: regrava a ordem inteira em vez de trocar duas linhas — são
      // poucas seções, e assim a lista se conserta sozinha se a ordem repetir.
      for (const [idx, s] of nova.entries()) {
        const { error } = await supabase
          .from("catalogo_secoes")
          .update({ ordem: idx })
          .eq("id", s.id);
        if (error) throw error;
      }
    },
    onSuccess: recarregarSecoes,
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const excluirSecao = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("catalogo_secoes").delete().eq("id", secaoId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Seção excluída. Os produtos dela continuam no catálogo, sem seção.");
      setSecaoId("");
      setExcluirSecaoAberto(false);
      recarregarSecoes();
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const total = catalogoQuery.data?.total ?? 0;
  const totalAdd = cadastroQuery.data?.total ?? 0;
  const ocupado = adicionar.isPending || remover.isPending || colar.isPending || excluir.isPending;
  const mexendoNaSecao =
    criarSecao.isPending ||
    renomearSecao.isPending ||
    moverSecao.isPending ||
    excluirSecao.isPending;
  const destino = secao ? `à seção ${secao.nome}` : `ao catálogo ${catalogo?.nome ?? ""}`;

  function abrirNovaSecao() {
    setNomeSecao("");
    setSecaoDialog("criar");
  }

  function abrirRenomearSecao() {
    setNomeSecao(secao?.nome ?? "");
    setSecaoDialog("renomear");
  }

  const nomeSecaoLimpo = nomeSecao.trim();
  // O banco já barra nome repetido no mesmo catálogo; avisar antes evita o toast de erro.
  const nomeRepetido = secoes.some(
    (s) => s.id !== secaoId && s.nome.toLowerCase() === nomeSecaoLimpo.toLowerCase(),
  );

  function salvarSecao(e: React.FormEvent) {
    e.preventDefault();
    if (!nomeSecaoLimpo || nomeRepetido) return;
    if (secaoDialog === "criar") criarSecao.mutate(nomeSecaoLimpo);
    else if (nomeSecaoLimpo !== secao?.nome) renomearSecao.mutate(nomeSecaoLimpo);
    else setSecaoDialog(null);
  }

  return (
    <div>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold">Catálogos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            O que cada distribuidora mostra ao cliente — e os catálogos personalizados, que não
            pertencem a nenhuma delas e viram links extras para os vendedores.
          </p>
        </div>
        <Button
          variant="outline"
          className="h-11 rounded-xl font-bold"
          onClick={() => {
            setNome("");
            setEmoji("🔥");
            setCor(COR_PADRAO);
            setCopiarDe(catalogoId);
            setCriarAberto(true);
          }}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Novo personalizado
        </Button>
        {catalogoId && (
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
        <Select value={catalogoId} onValueChange={setCatalogoId}>
          <SelectTrigger className="h-11 w-64 rounded-xl">
            <SelectValue placeholder="Escolha o catálogo" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Distribuidoras</SelectLabel>
              {distribuidoras.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.nome}
                </SelectItem>
              ))}
            </SelectGroup>
            {personalizados.length > 0 && (
              <SelectGroup>
                <SelectLabel>Personalizados</SelectLabel>
                {personalizados.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.emoji ? `${c.emoji} ${c.nome}` : c.nome}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>

        {catalogo && (
          <>
            <span className="rounded-xl bg-primary-soft px-3 py-2 text-sm font-bold text-primary">
              {termo ? `${total} na busca` : `${total} no catálogo`}
            </span>
            <span className="font-mono text-xs text-muted-foreground">/c/…/{catalogo.slug}</span>
          </>
        )}
        {(catalogoQuery.isFetching || ocupado) && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}

        {catalogo?.personalizado && (
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold">{catalogo.ativo ? "Ativo" : "Inativo"}</span>
              <Switch
                checked={catalogo.ativo}
                onCheckedChange={(v) => alternarAtivo.mutate(v)}
                disabled={alternarAtivo.isPending}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl text-destructive"
              disabled={ocupado}
              onClick={() => {
                if (!window.confirm(`Excluir o catálogo ${catalogo.nome} e todos os seus links?`))
                  return;
                excluir.mutate();
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir catálogo
            </Button>
          </div>
        )}
      </div>

      {!catalogoId ? (
        <p className="mt-6 rounded-2xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          Escolha um catálogo para montá-lo — ou crie um personalizado.
        </p>
      ) : (
        <>
          {/* As abas do cliente. A aberta filtra a lista e recebe o que for adicionado. */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Aba ativa={!secaoId} onClick={() => setSecaoId("")}>
              Todos
            </Aba>
            {secoes.map((s) => (
              <Aba key={s.id} ativa={secaoId === s.id} onClick={() => setSecaoId(s.id)}>
                {s.nome}
              </Aba>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              disabled={mexendoNaSecao}
              onClick={abrirNovaSecao}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Nova seção
            </Button>

            {secao && (
              <div className="ml-auto flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  title="Mover seção para a esquerda"
                  disabled={mexendoNaSecao || secoes[0]?.id === secao.id}
                  onClick={() => moverSecao.mutate(-1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  title="Mover seção para a direita"
                  disabled={mexendoNaSecao || secoes[secoes.length - 1]?.id === secao.id}
                  onClick={() => moverSecao.mutate(1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  title="Renomear seção"
                  disabled={mexendoNaSecao}
                  onClick={abrirRenomearSecao}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive"
                  title="Excluir seção"
                  disabled={mexendoNaSecao}
                  onClick={() => setExcluirSecaoAberto(true)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={secao ? `Buscar em ${secao.nome}` : "Buscar no catálogo"}
              className="h-11 max-w-md rounded-xl"
            />
            <Button
              variant="outline"
              className="rounded-xl"
              disabled={ocupado}
              onClick={() => {
                setNaoEncontrados([]);
                setTextoCodigos("");
                setColarAberto(true);
              }}
            >
              <ClipboardPaste className="mr-2 h-4 w-4" />
              Colar códigos
            </Button>
            {total > 0 && (
              <Button
                variant="outline"
                className="ml-auto rounded-xl text-destructive"
                disabled={ocupado}
                onClick={async () => {
                  const alvo = termo ? `os ${total} da busca` : `todos os ${total}`;
                  const de = secao ? `da seção ${secao.nome}` : `do catálogo ${catalogo?.nome}`;
                  if (!window.confirm(`Remover ${alvo} ${de} do catálogo?`)) return;
                  remover.mutate(await todosOsIds(true, termo));
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remover {total}
              </Button>
            )}
          </div>

          <ul className="mt-4 divide-y rounded-2xl border bg-card">
            {(catalogoQuery.data?.linhas ?? []).map((item) => (
              <LinhaProduto
                key={item.produto.id}
                produto={item.produto}
                etiqueta={
                  // Na aba Todos vale mostrar de qual seção o item é.
                  !secaoId && item.secaoId ? (
                    <span className="shrink-0 rounded-lg bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                      {nomePorSecao.get(item.secaoId)}
                    </span>
                  ) : null
                }
                acao={
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive"
                    disabled={ocupado}
                    onClick={() => remover.mutate([item.produto.id])}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                }
              />
            ))}
            {!catalogoQuery.isLoading && total === 0 && (
              <p className="p-12 text-center text-sm text-muted-foreground">
                {termo
                  ? "Nenhum produto bate com essa busca."
                  : secao
                    ? `A seção ${secao.nome} está vazia. Use “Adicionar produtos” ou “Colar códigos” — vai tudo para ela.`
                    : "Catálogo vazio. Use “Adicionar produtos” ou “Colar códigos” para montá-lo."}
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

      <AlertDialog open={excluirSecaoAberto} onOpenChange={setExcluirSecaoAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a seção {secao?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              A aba some do catálogo do cliente. Os produtos dela <strong>continuam</strong> no
              catálogo, só ficam sem seção — você pode organizá-los de novo depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={excluirSecao.isPending}
              onClick={(e) => {
                e.preventDefault();
                excluirSecao.mutate();
              }}
            >
              {excluirSecao.isPending ? "Excluindo..." : "Excluir seção"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={secaoDialog !== null} onOpenChange={(v) => !v && setSecaoDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={salvarSecao} className="space-y-4">
            <DialogHeader>
              <DialogTitle>
                {secaoDialog === "criar" ? "Nova seção" : `Renomear ${secao?.nome ?? "seção"}`}
              </DialogTitle>
              <DialogDescription>
                A seção vira uma aba no catálogo do cliente. Com ela aberta aqui, tudo que você
                adicionar ou colar cai nela.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor="nome-secao">Nome da seção</Label>
              <Input
                id="nome-secao"
                autoFocus
                value={nomeSecao}
                onChange={(e) => setNomeSecao(e.target.value)}
                placeholder="Ex.: Bebidas"
                maxLength={40}
                className="h-11 rounded-xl"
              />
              {nomeRepetido && (
                <p className="text-xs font-semibold text-destructive">
                  Já existe uma seção com esse nome neste catálogo.
                </p>
              )}
            </div>

            <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Como o cliente vê
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Aba ativa={false} onClick={() => {}}>
                  Todos
                </Aba>
                <Aba ativa onClick={() => {}}>
                  {nomeSecaoLimpo || "Nova seção"}
                </Aba>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSecaoDialog(null)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className="rounded-xl font-bold"
                disabled={!nomeSecaoLimpo || nomeRepetido || mexendoNaSecao}
              >
                {mexendoNaSecao
                  ? "Salvando..."
                  : secaoDialog === "criar"
                    ? "Criar seção"
                    : "Salvar nome"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={criarAberto} onOpenChange={setCriarAberto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo catálogo personalizado</DialogTitle>
            <DialogDescription>
              Uma seleção de produtos que não pertence a nenhuma distribuidora. Assim que existir,
              vira link extra no painel de todo vendedor.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nome-catalogo">Nome</Label>
              <Input
                id="nome-catalogo"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Promoção de Páscoa"
                className="h-11 rounded-xl"
              />
              <p className="font-mono text-xs text-muted-foreground">
                /c/&lt;vendedor&gt;/{novoSlug || "…"}
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="emoji-catalogo">Emoji</Label>
                <Input
                  id="emoji-catalogo"
                  value={emoji}
                  onChange={(e) => setEmoji(e.target.value)}
                  maxLength={8}
                  className="h-11 w-16 rounded-xl text-center text-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cor-catalogo">Cor</Label>
                <input
                  id="cor-catalogo"
                  type="color"
                  value={cor}
                  onChange={(e) => setCor(e.target.value)}
                  className="h-11 w-16 cursor-pointer rounded-xl border bg-card p-1"
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEmoji(e)}
                    className="size-9 rounded-lg border text-lg transition hover:bg-muted"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Começar com uma cópia de</Label>
              <Select
                value={copiarDe || "vazio"}
                onValueChange={(v) => setCopiarDe(v === "vazio" ? "" : v)}
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vazio">Catálogo vazio</SelectItem>
                  {catalogos.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.emoji ? `${c.emoji} ${c.nome}` : c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex h-20 items-center justify-center rounded-2xl border bg-card">
              <MarcaCatalogo
                marca={{
                  slug: novoSlug || "novo",
                  nome: nome.trim() || "Seu catálogo",
                  cor,
                  emoji,
                }}
                className="text-lg"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCriarAberto(false)}>
              Cancelar
            </Button>
            <Button
              className="rounded-xl font-bold"
              disabled={!novoSlug || criar.isPending}
              onClick={() => criar.mutate()}
            >
              {criar.isPending ? "Criando..." : "Criar catálogo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={colarAberto} onOpenChange={setColarAberto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Colar códigos {destino}</DialogTitle>
            <DialogDescription>
              Cole a coluna de códigos da planilha ou do relatório. Vale qualquer separador: quebra
              de linha, vírgula, ponto e vírgula ou tab.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={textoCodigos}
            onChange={(e) => setTextoCodigos(e.target.value)}
            placeholder={"7891234567890\n7891234567891\n7891234567892"}
            className="min-h-40 rounded-xl font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {parseCodigos(textoCodigos).length} código(s) na lista, sem repetidos.
          </p>

          {naoEncontrados.length > 0 && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-xs font-semibold text-destructive">
                {naoEncontrados.length} código(s) sem cadastro de produto:
              </p>
              <p className="mt-1 max-h-24 overflow-y-auto break-all font-mono text-[11px] text-muted-foreground">
                {naoEncontrados.join(", ")}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 rounded-lg"
                onClick={() => {
                  navigator.clipboard.writeText(naoEncontrados.join("\n"));
                  toast.success("Códigos copiados.");
                }}
              >
                Copiar lista
              </Button>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setColarAberto(false)}>
              Fechar
            </Button>
            <Button
              className="rounded-xl font-bold"
              disabled={colar.isPending || textoCodigos.trim() === ""}
              onClick={() => colar.mutate()}
            >
              {colar.isPending ? "Vinculando..." : "Vincular ao catálogo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adicionarAberto} onOpenChange={setAdicionarAberto}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Adicionar {destino}</DialogTitle>
            <DialogDescription>
              Busque no cadastro de produtos e adicione um a um ou a busca inteira.
              {secao && " Um produto que já está em outra seção é movido para esta."}
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
              const ligado = jaNoCatalogoQuery.data?.get(p.codigo);
              const jaTem = !!ligado;
              // Sem seção aberta, produto que já está no catálogo não tem ação:
              // adicionar de novo só serviria para tirá-lo da seção sem querer.
              const parado = jaTem && (!secaoId || ligado.secaoId === secaoId);
              return (
                <LinhaProduto
                  key={p.id}
                  produto={p}
                  acao={
                    parado ? (
                      <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">
                        <Check className="h-3.5 w-3.5" />
                        {secaoId ? "Nesta seção" : "No catálogo"}
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl"
                        disabled={ocupado || jaNoCatalogoQuery.isLoading}
                        // Mover mexe no vínculo que já existe; adicionar o outro
                        // cadastro do mesmo EAN criaria um card repetido.
                        onClick={() => adicionar.mutate([ligado?.produtoId ?? p.id])}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        {jaTem ? "Mover para cá" : "Adicionar"}
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
