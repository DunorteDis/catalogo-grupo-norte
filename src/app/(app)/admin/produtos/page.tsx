"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { chamar } from "@/lib/chamar";
import { mensagemErro } from "@/lib/erros";
import { Badge, ListRow, PageHeader, SearchInput } from "@/components/abastex";
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
import { Button } from "@/components/ui/button";
import { fotoUrl, MAX_FOTO, PAGINA_PRODUTOS as PAGE, TIPOS_IMAGEM } from "@/lib/catalogo";
import {
  ativarProduto,
  enviarFotoProduto,
  excluirProduto,
  listarProdutos,
  salvarProduto,
} from "@/server/produtos";

type Produto = {
  id: string;
  codigo: string;
  nome: string;
  arquivo: string | null;
  ativo: boolean;
  cod_empresa: number | null;
};

export default function ProdutosPage() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  const [pagina, setPagina] = useState(0);

  // null = diálogo fechado; string vazia = produto novo; id = editando aquele.
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [arquivo, setArquivo] = useState("");
  const [fotoQuebrada, setFotoQuebrada] = useState(false);
  // Foto arrastada ainda não enviada: só sobe ao salvar, então cancelar não deixa arquivo solto no S3.
  const [fotoNova, setFotoNova] = useState<File | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const inputFoto = useRef<HTMLInputElement>(null);

  const [aExcluir, setAExcluir] = useState<Produto | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setTermo(busca.trim());
      setPagina(0);
    }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  const { data } = useQuery({
    queryKey: ["admin-produtos", termo, pagina],
    queryFn: () => chamar(listarProdutos(termo, pagina)),
  });

  const alternar = useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) => chamar(ativarProduto(id, ativo)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-produtos"] }),
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const salvar = useMutation({
    mutationFn: async () => {
      let foto = arquivo;
      if (fotoNova) {
        const dados = new FormData();
        dados.set("arquivo", fotoNova);
        foto = await chamar(enviarFotoProduto(dados));
      }
      return chamar(salvarProduto(editandoId || null, { codigo, nome, arquivo: foto }));
    },
    onSuccess: () => {
      toast.success(editandoId ? "Produto atualizado." : `${nome.trim()} cadastrado.`);
      setEditandoId(null);
      qc.invalidateQueries({ queryKey: ["admin-produtos"] });
      // O catálogo do cliente mostra nome e foto deste cadastro.
      qc.invalidateQueries({ queryKey: ["catalogo"] });
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const excluir = useMutation({
    mutationFn: (id: string) => chamar(excluirProduto(id)),
    onSuccess: () => {
      toast.success("Produto excluído do cadastro.");
      setAExcluir(null);
      qc.invalidateQueries({ queryKey: ["admin-produtos"] });
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  function abrirNovo() {
    setCodigo("");
    setNome("");
    setArquivo("");
    setFotoQuebrada(false);
    setFotoNova(null);
    setEditandoId("");
  }

  function abrirEdicao(p: Produto) {
    setCodigo(p.codigo);
    setNome(p.nome);
    setArquivo(p.arquivo ?? "");
    setFotoQuebrada(false);
    setFotoNova(null);
    setEditandoId(p.id);
  }

  function escolherFoto(f: File | undefined) {
    if (!f) return;
    if (!TIPOS_IMAGEM.includes(f.type)) {
      toast.error("Use uma imagem PNG, JPG, WEBP ou GIF.");
      return;
    }
    if (f.size > MAX_FOTO) {
      toast.error("A foto passa de 5 MB. Diminua o tamanho e tente de novo.");
      return;
    }
    setFotoQuebrada(false);
    setFotoNova(f);
  }

  // ponytail: o blob da prévia não é revogado — é uma foto por vez, num diálogo do admin.
  const previa = useMemo(
    () => (fotoNova ? URL.createObjectURL(fotoNova) : fotoUrl(arquivo)),
    [fotoNova, arquivo],
  );
  const podeSalvar = codigo.trim() !== "" && nome.trim() !== "" && !salvar.isPending;

  function aoSubmeter(e: React.FormEvent) {
    e.preventDefault();
    if (podeSalvar) salvar.mutate();
  }

  const linhas = data?.linhas ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={["Abastex", "Produtos"]}
        icon={Package}
        tone="warning"
        title="Produtos"
        subtitle={`${data ? `${data.total.toLocaleString("pt-BR")} produtos cadastrados. ` : ""}Desative os que não devem aparecer no catálogo.`}
        actions={
          <Button onClick={abrirNovo}>
            <Plus />
            Novo produto
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        <SearchInput
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou código"
        />

        <div className="ax-list empty:hidden">
          {linhas.map((p) => {
            const foto = fotoUrl(p.arquivo);
            return (
              <ListRow
                key={p.id}
                inactive={!p.ativo}
                thumb={
                  foto ? (
                    <img src={foto} alt={p.nome} loading="lazy" />
                  ) : (
                    <Package size={22} aria-hidden />
                  )
                }
                title={p.nome}
                badge={!p.ativo && <Badge dot>Oculto</Badge>}
                meta={
                  <>
                    Cód. <code>{p.codigo}</code>
                    {/* O cadastro espelha o ERP, onde o mesmo código aparece mais de
                        uma vez: a empresa é o que separa boa parte das repetições. */}
                    {p.cod_empresa != null && ` · Empresa ${p.cod_empresa}`}
                  </>
                }
                actions={
                  <>
                    <Switch
                      checked={!!p.ativo}
                      aria-label="Mostrar no catálogo"
                      title="Mostrar no catálogo"
                      onCheckedChange={(v) => alternar.mutate({ id: p.id, ativo: v })}
                      className="mr-2"
                    />
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Editar produto"
                      title="Editar produto"
                      onClick={() => abrirEdicao(p)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="danger"
                      aria-label="Excluir do cadastro"
                      title="Excluir do cadastro"
                      onClick={() => setAExcluir(p)}
                    >
                      <Trash2 />
                    </Button>
                  </>
                }
              />
            );
          })}
          {data && linhas.length === 0 && (
            <p className="p-12 text-center text-sm text-ink-muted">
              {termo ? "Nenhum produto bate com essa busca." : "Nenhum produto cadastrado ainda."}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            disabled={pagina === 0}
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
          >
            Anterior
          </Button>
          <span className="text-xs text-ink-muted">Página {pagina + 1}</span>
          <Button
            variant="outline"
            disabled={linhas.length < PAGE}
            onClick={() => setPagina((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>

      <Dialog open={editandoId !== null} onOpenChange={(v) => !v && setEditandoId(null)}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={aoSubmeter} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{editandoId ? "Editar produto" : "Novo produto"}</DialogTitle>
              <DialogDescription>
                {editandoId
                  ? "Nome e foto valem em todos os catálogos onde este produto está. Pedidos já enviados não mudam."
                  : "Entra no cadastro geral. Para ele aparecer para o cliente, adicione depois a um catálogo em Catálogos."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor="codigo-produto">Código</Label>
              <Input
                id="codigo-produto"
                autoFocus
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Ex.: 7891234567890"
                className="font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nome-produto">Nome</Label>
              <Input
                id="nome-produto"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: CD ORAL B EXTRA FRESH 3X70G"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="foto-produto">Foto (opcional)</Label>
              <input
                ref={inputFoto}
                id="foto-produto"
                type="file"
                accept={TIPOS_IMAGEM.join(",")}
                hidden
                onChange={(e) => {
                  escolherFoto(e.target.files?.[0]);
                  // Limpa para que escolher o mesmo arquivo de novo ainda dispare o change.
                  e.target.value = "";
                }}
              />
              {/* Área de soltar: botão de verdade, então Tab + Enter também abre o seletor.
                  Filhos sem ponteiro, senão o dragleave dispara ao passar por cima deles. */}
              <button
                type="button"
                onClick={() => inputFoto.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setArrastando(true);
                }}
                onDragLeave={() => setArrastando(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setArrastando(false);
                  escolherFoto(e.dataTransfer.files[0]);
                }}
                data-arrastando={arrastando || undefined}
                className="flex w-full cursor-pointer items-center gap-4 rounded-2xl border-2 border-dashed border-line-strong bg-surface-sunken p-3 text-left transition-colors hover:border-brand hover:bg-surface-hover data-[arrastando]:border-brand data-[arrastando]:bg-brand-soft [&>*]:pointer-events-none"
              >
                <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-md bg-card">
                  {previa && !fotoQuebrada ? (
                    <img
                      src={previa}
                      alt=""
                      className="h-full w-full object-contain"
                      onError={() => setFotoQuebrada(true)}
                    />
                  ) : (
                    <ImagePlus className="size-6 text-ink-subtle" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">
                    {arrastando
                      ? "Solte a foto aqui"
                      : previa
                        ? "Arraste outra foto para trocar"
                        : "Arraste a foto aqui"}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    ou clique para escolher. PNG, JPG, WEBP ou GIF de até 5 MB.
                  </span>
                </span>
              </button>
              {previa && (
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-xs text-ink-muted">
                    {fotoNova
                      ? `${fotoNova.name} · sobe quando você salvar.`
                      : fotoQuebrada
                        ? "Não consegui carregar a foto atual. Arraste uma nova para trocar."
                        : null}
                  </p>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      setFotoNova(null);
                      setArquivo("");
                      setFotoQuebrada(false);
                    }}
                  >
                    <Trash2 />
                    Remover foto
                  </Button>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditandoId(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="accent" disabled={!podeSalvar}>
                {salvar.isPending
                  ? "Salvando..."
                  : editandoId
                    ? "Salvar alterações"
                    : "Cadastrar produto"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={aExcluir !== null} onOpenChange={(v) => !v && setAExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {aExcluir?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              O produto sai do cadastro e <strong>de todos os catálogos</strong> onde estiver. Os
              pedidos já feitos não mudam — eles guardam código e nome próprios. Se a ideia é só
              tirar do catálogo, o botão ao lado desativa sem apagar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={excluir.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (aExcluir) excluir.mutate(aExcluir.id);
              }}
            >
              {excluir.isPending ? "Excluindo..." : "Excluir produto"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
