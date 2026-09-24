"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  ImageIcon,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Smile,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { mensagemErro } from "@/lib/erros";
import { chamar } from "@/lib/chamar";
import {
  fotoUrl,
  MAX_IMAGEM,
  PAGINA_CATALOGO as PAGINA,
  parseCodigos,
  slugify,
  TIPOS_IMAGEM,
} from "@/lib/catalogo";
import {
  ativarCatalogo,
  cadastroParaAdicionar,
  colarCodigos,
  criarSecao as criarSecaoAcao,
  desvincular,
  desvincularBusca,
  enviarImagem,
  excluirCatalogo,
  excluirSecao as excluirSecaoAcao,
  itensDoCatalogo,
  jaNoCatalogo,
  listarCatalogos,
  ordenarSecoes,
  renomearSecao as renomearSecaoAcao,
  salvarCatalogo as salvarCatalogoAcao,
  secoesDoCatalogo,
  vincular,
  vincularBusca,
  type Catalogo,
  type Secao,
} from "@/server/catalogos";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const COR_PADRAO = "#b73d25";

/**
 * Emojis por assunto, pensados para o que uma distribuidora vende e comemora.
 * Não é a lista completa: o campo do formulário aceita qualquer emoji colado.
 * ponytail: lista curada em vez de biblioteca de emoji — trocar se pedirem busca.
 */
const GRUPOS_EMOJI: Array<[grupo: string, emojis: string]> = [
  ["Promoção", "🔥 ⭐ 🌟 ✨ 💥 ⚡ 🏷️ 💰 💸 🤑 🎯 🚀 🆕 💯 👑 🏆 🥇 🎉 📣 💎 🛒 🛍️ 📦 🚚 ⏰ ✅ ❤️"],
  [
    "Comida",
    "🍕 🍔 🌭 🍟 🥪 🌮 🍝 🍜 🍲 🍚 🥩 🍗 🥓 🍖 🐟 🦐 🧀 🥚 🍳 🍞 🥐 🥖 🧈 🥞 🍰 🎂 🧁 🍫 🍬 🍭 🍪 🍩 🍦 🍿 🥫 🧂 🍯 🥜",
  ],
  ["Hortifrúti", "🍎 🍐 🍌 🍇 🍉 🍓 🍒 🍍 🥭 🥥 🍋 🍊 🥑 🥕 🌽 🥔 🍅 🥒 🥬 🥦 🧅 🧄 🌶️ 🍄"],
  ["Bebidas", "🥤 🧃 🧋 ☕ 🍵 🥛 🍼 💧 🧊 🍺 🍻 🍷 🍾 🥂 🍹 🍸 🥃"],
  ["Limpeza e casa", "🧴 🧼 🧽 🧹 🧺 🪣 🧻 🧤 🪥 🗑️ 🏠 🛋️ 🛏️ 🍽️ 🔌 💡 🔋 🕯️"],
  ["Higiene e beleza", "🪒 💄 💅 💋 🧖 💆 🌸 🌺 👶 🧷 💊 🩹 😷"],
  ["Pets", "🐶 🐱 🐾 🦴 🐦 🐠"],
  ["Datas e estações", "🎄 🎅 ⛄ 🎆 🎊 🎁 🎈 🐰 🎃 👻 💝 💐 👔 🎓 🏖️ ☀️ 🌧️ ❄️ 🍂 🌙 ⚽"],
];

/** Sobe a imagem do catálogo e devolve a URL que vai para `imagem_url`. */
async function enviarImagemDoCatalogo(arquivo: File) {
  const dados = new FormData();
  dados.set("arquivo", arquivo);
  return chamar(enviarImagem(dados));
}

type Produto = { id: string; codigo: string; nome: string; arquivo: string | null };
type ItemDoCatalogo = { produto: Produto; secaoId: string | null };

function useDebounce(valor: string, ms = 350) {
  const [saida, setSaida] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setSaida(valor.trim()), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return saida;
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

export default function CatalogoPage() {
  const qc = useQueryClient();
  const [catalogoId, setCatalogoId] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const termo = useDebounce(busca);

  const [adicionarAberto, setAdicionarAberto] = useState(false);
  const [buscaAdd, setBuscaAdd] = useState("");
  const [paginaAdd, setPaginaAdd] = useState(0);
  const termoAdd = useDebounce(buscaAdd);

  // Um formulário só para criar e editar personalizado; `editando` null = criando.
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<Catalogo | null>(null);
  const [nome, setNome] = useState("");
  const [icone, setIcone] = useState<"emoji" | "imagem">("emoji");
  const [emoji, setEmoji] = useState("🔥");
  const [imagemUrl, setImagemUrl] = useState<string | null>(null);
  const [imagemNova, setImagemNova] = useState<File | null>(null);
  const [cor, setCor] = useState(COR_PADRAO);
  const [copiarDe, setCopiarDe] = useState("");
  const inputImagem = useRef<HTMLInputElement>(null);
  // ponytail: o blob da prévia não é revogado — é uma imagem por vez, num diálogo do admin.
  const previaImagem = useMemo(
    () => (imagemNova ? URL.createObjectURL(imagemNova) : imagemUrl),
    [imagemNova, imagemUrl],
  );

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
    queryFn: () => chamar(listarCatalogos()),
  });

  const catalogos = catalogosQuery.data ?? [];
  const distribuidoras = catalogos.filter((c) => !c.personalizado);
  const personalizados = catalogos.filter((c) => c.personalizado);
  const catalogo = catalogos.find((c) => c.id === catalogoId);

  const secoesQuery = useQuery({
    queryKey: ["catalogo-secoes", catalogoId],
    enabled: !!catalogoId,
    queryFn: () => chamar(secoesDoCatalogo(catalogoId)),
  });

  const secoes = secoesQuery.data ?? [];
  const secao = secoes.find((s) => s.id === secaoId);
  const nomePorSecao = new Map(secoes.map((s) => [s.id, s.nome]));

  const catalogoQuery = useQuery({
    queryKey: ["catalogo-itens", catalogoId, secaoId, termo, pagina],
    enabled: !!catalogoId,
    queryFn: () => chamar(itensDoCatalogo({ catalogoId, secaoId, termo, pagina })),
  });

  // Cadastro completo, só dentro do modal de adicionar.
  const cadastroQuery = useQuery({
    queryKey: ["catalogo-cadastro", termoAdd, paginaAdd],
    enabled: adicionarAberto,
    queryFn: () => chamar(cadastroParaAdicionar(termoAdd, paginaAdd)),
  });

  const idsVisiveisNoModal = (cadastroQuery.data?.linhas ?? []).map((p) => p.id);

  /**
   * Em que seção cada linha do cadastro já está, para o modal saber se oferece
   * "Adicionar", "Mover para cá" ou só avisar que ela já está nesta seção. Vai
   * pelo id da linha, nunca pelo EAN: o ERP repete código, e olhar por ele
   * amarrava as linhas — adicionar uma marcava as duas, remover soltava as duas.
   */
  const jaNoCatalogoQuery = useQuery({
    queryKey: ["catalogo-ja-tem", catalogoId, idsVisiveisNoModal],
    enabled: adicionarAberto && !!catalogoId && idsVisiveisNoModal.length > 0,
    queryFn: async () => new Map(await chamar(jaNoCatalogo(catalogoId, idsVisiveisNoModal))),
  });

  function recarregar() {
    qc.invalidateQueries({ queryKey: ["catalogo-itens"] });
    qc.invalidateQueries({ queryKey: ["catalogo-ja-tem"] });
  }

  const adicionar = useMutation({
    mutationFn: (alvo: string[] | "busca") =>
      chamar(
        alvo === "busca"
          ? vincularBusca(catalogoId, termoAdd, secaoId || null)
          : vincular(catalogoId, alvo, secaoId || null),
      ),
    onSuccess: (n) => {
      const onde = secao ? `à seção ${secao.nome}` : "ao catálogo";
      toast.success(`${n} ${n === 1 ? "produto adicionado" : "produtos adicionados"} ${onde}.`);
      recarregar();
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const remover = useMutation({
    mutationFn: (alvo: string[] | "busca") =>
      chamar(
        alvo === "busca"
          ? desvincularBusca(catalogoId, secaoId, termo)
          : desvincular(catalogoId, alvo),
      ),
    onSuccess: (n) => {
      toast.success(`${n} ${n === 1 ? "produto removido" : "produtos removidos"} do catálogo.`);
      recarregar();
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const novoSlug = slugify(nome);

  function abrirFormCatalogo(c?: Catalogo) {
    setEditando(c ?? null);
    setNome(c?.nome ?? "");
    setIcone(c?.imagem_url ? "imagem" : "emoji");
    setEmoji(c?.emoji ?? "🔥");
    setImagemUrl(c?.imagem_url ?? null);
    setImagemNova(null);
    setCor(c?.cor ?? COR_PADRAO);
    setCopiarDe(c ? "" : catalogoId);
    setFormAberto(true);
  }

  function escolherImagem(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    // Limpa para que escolher o mesmo arquivo de novo ainda dispare o change.
    e.target.value = "";
    if (!arquivo) return;
    if (!TIPOS_IMAGEM.includes(arquivo.type)) {
      toast.error("Use uma imagem PNG, JPG, WEBP ou GIF.");
      return;
    }
    if (arquivo.size > MAX_IMAGEM) {
      toast.error("A imagem passa de 2 MB. Diminua o tamanho e tente de novo.");
      return;
    }
    setImagemNova(arquivo);
  }

  const salvarCatalogo = useMutation({
    mutationFn: async () => {
      const limpo = nome.trim();
      if (!limpo || !novoSlug) throw new Error("Dê um nome ao catálogo.");
      let imagem: string | null = null;
      if (icone === "imagem") {
        imagem = imagemNova ? await enviarImagemDoCatalogo(imagemNova) : imagemUrl;
        if (!imagem) throw new Error("Escolha uma imagem para o catálogo.");
      }
      return chamar(
        salvarCatalogoAcao(editando?.id ?? null, {
          nome: limpo,
          cor,
          emoji: icone === "emoji" ? emoji.trim() || null : null,
          imagemUrl: imagem,
          copiarDe: editando ? "" : copiarDe,
        }),
      );
    },
    onSuccess: (salvo) => {
      toast.success(`Catálogo ${salvo.nome} ${editando ? "atualizado" : "criado"}.`);
      setFormAberto(false);
      qc.invalidateQueries({ queryKey: ["catalogos"] });
      qc.invalidateQueries({ queryKey: ["catalogos-publicos"] });
      setCatalogoId(salvo.id);
      recarregar();
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const colar = useMutation({
    mutationFn: () => chamar(colarCodigos(catalogoId, textoCodigos, secaoId || null)),
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
    mutationFn: (ativo: boolean) => chamar(ativarCatalogo(catalogoId, ativo)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalogos"] }),
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const excluir = useMutation({
    mutationFn: () => chamar(excluirCatalogo(catalogoId)),
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
    mutationFn: (nomeSecao: string) => chamar(criarSecaoAcao(catalogoId, nomeSecao)),
    onSuccess: (id) => {
      toast.success("Seção criada. O que você adicionar agora cai nela.");
      recarregarSecoes();
      setSecaoId(id);
      setSecaoDialog(null);
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const renomearSecao = useMutation({
    mutationFn: (nomeNovo: string) => chamar(renomearSecaoAcao(secaoId, nomeNovo)),
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
      await chamar(ordenarSecoes(nova.map((s) => s.id)));
    },
    onSuccess: recarregarSecoes,
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const excluirSecao = useMutation({
    mutationFn: () => chamar(excluirSecaoAcao(secaoId)),
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
          onClick={() => abrirFormCatalogo()}
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
              className="rounded-xl"
              disabled={ocupado}
              onClick={() => abrirFormCatalogo(catalogo)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Editar
            </Button>
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
                onClick={() => {
                  const alvo = termo ? `os ${total} da busca` : `todos os ${total}`;
                  const de = secao ? `da seção ${secao.nome}` : `do catálogo ${catalogo?.nome}`;
                  if (!window.confirm(`Remover ${alvo} ${de} do catálogo?`)) return;
                  remover.mutate("busca");
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

      <Dialog open={formAberto} onOpenChange={setFormAberto}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editando ? `Editar ${editando.nome}` : "Novo catálogo personalizado"}
            </DialogTitle>
            <DialogDescription>
              {editando
                ? "Nome, ícone e cor mudam na hora para o cliente. O link continua o mesmo."
                : "Uma seleção de produtos que não pertence a nenhuma distribuidora. Assim que existir, vira link extra no painel de todo vendedor."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
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
                /c/&lt;vendedor&gt;/{editando?.slug ?? (novoSlug || "…")}
              </p>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-1.5">
                <Label>Ícone</Label>
                <ToggleGroup
                  type="single"
                  value={icone}
                  // Radix solta o valor ao clicar de novo no marcado; aqui sempre há um.
                  onValueChange={(v) => v && setIcone(v as "emoji" | "imagem")}
                  className="gap-1 rounded-xl bg-muted p-1"
                >
                  <ToggleGroupItem
                    value="emoji"
                    className="h-9 rounded-lg px-4 font-semibold data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm"
                  >
                    <Smile />
                    Emoji
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="imagem"
                    className="h-9 rounded-lg px-4 font-semibold data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm"
                  >
                    <ImageIcon />
                    Imagem
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cor-catalogo">Cor</Label>
                <input
                  id="cor-catalogo"
                  type="color"
                  value={cor}
                  onChange={(e) => setCor(e.target.value)}
                  className="block h-11 w-16 cursor-pointer rounded-xl border bg-card p-1"
                />
              </div>
            </div>

            {icone === "emoji" ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Input
                    aria-label="Emoji escolhido"
                    value={emoji}
                    onChange={(e) => setEmoji(e.target.value)}
                    maxLength={8}
                    className="h-11 w-16 shrink-0 rounded-xl text-center text-xl"
                  />
                  <p className="text-xs text-muted-foreground">
                    Escolha abaixo ou cole qualquer emoji no campo. No Windows, a tecla Windows +
                    ponto abre todos.
                  </p>
                </div>
                <div className="max-h-56 space-y-3 overflow-y-auto rounded-xl border p-2">
                  {GRUPOS_EMOJI.map(([grupo, lista]) => (
                    <div key={grupo}>
                      <p className="px-1 pb-1 text-xs font-semibold text-muted-foreground">
                        {grupo}
                      </p>
                      <div className="flex flex-wrap gap-0.5">
                        {lista.split(" ").map((e) => (
                          <button
                            key={e}
                            type="button"
                            aria-pressed={emoji === e}
                            onClick={() => setEmoji(e)}
                            className={cn(
                              "size-9 rounded-lg text-xl transition hover:bg-muted",
                              emoji === e && "bg-primary-soft ring-2 ring-primary",
                            )}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <input
                  ref={inputImagem}
                  type="file"
                  accept={TIPOS_IMAGEM.join(",")}
                  hidden
                  onChange={escolherImagem}
                />
                <button
                  type="button"
                  aria-label={previaImagem ? "Trocar imagem" : "Escolher imagem"}
                  onClick={() => inputImagem.current?.click()}
                  className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed bg-muted/40 transition hover:bg-muted"
                >
                  {previaImagem ? (
                    <img src={previaImagem} alt="" className="h-full w-full object-contain p-1.5" />
                  ) : (
                    <ImagePlus className="h-6 w-6 text-muted-foreground" />
                  )}
                </button>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => inputImagem.current?.click()}
                  >
                    {previaImagem ? "Trocar imagem" : "Escolher imagem"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG, WEBP ou GIF de até 2 MB. Ela aparece inteira, na altura do nome —
                    logo, ícone ou foto.
                  </p>
                </div>
              </div>
            )}

            {!editando && (
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
            )}

            <div className="space-y-1.5">
              <Label>Como o cliente vê</Label>
              <div
                className="flex h-20 items-center justify-center rounded-2xl border"
                style={{ backgroundColor: `${cor}14`, borderColor: `${cor}55` }}
              >
                <MarcaCatalogo
                  marca={{
                    slug: editando?.slug ?? (novoSlug || "novo"),
                    nome: nome.trim() || "Seu catálogo",
                    cor,
                    emoji: icone === "emoji" ? emoji : null,
                    imagem_url: icone === "imagem" ? previaImagem : null,
                  }}
                  className="text-lg"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormAberto(false)}>
              Cancelar
            </Button>
            <Button
              className="rounded-xl font-bold"
              disabled={
                !novoSlug || salvarCatalogo.isPending || (icone === "imagem" && !previaImagem)
              }
              onClick={() => salvarCatalogo.mutate()}
            >
              {salvarCatalogo.isPending
                ? "Salvando..."
                : editando
                  ? "Salvar alterações"
                  : "Criar catálogo"}
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
              onClick={() => adicionar.mutate("busca")}
            >
              <Plus className="mr-2 h-4 w-4" />
              Adicionar {totalAdd}
            </Button>
          </div>

          <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-xl border">
            {(cadastroQuery.data?.linhas ?? []).map((p) => {
              const jaTem = jaNoCatalogoQuery.data?.has(p.id) ?? false;
              const secaoDele = jaNoCatalogoQuery.data?.get(p.id) ?? null;
              // Sem seção aberta, produto que já está no catálogo não tem ação:
              // adicionar de novo só serviria para tirá-lo da seção sem querer.
              const parado = jaTem && (!secaoId || secaoDele === secaoId);
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
                        onClick={() => adicionar.mutate([p.id])}
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
