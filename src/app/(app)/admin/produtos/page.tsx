"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ImageOff, Package, Pencil, Plus, Trash2 } from "lucide-react";
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
import { fotoUrl, PAGINA_PRODUTOS as PAGE } from "@/lib/catalogo";
import { ativarProduto, excluirProduto, listarProdutos, salvarProduto } from "@/server/produtos";

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
    mutationFn: () => chamar(salvarProduto(editandoId || null, { codigo, nome, arquivo })),
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
    setEditandoId("");
  }

  function abrirEdicao(p: Produto) {
    setCodigo(p.codigo);
    setNome(p.nome);
    setArquivo(p.arquivo ?? "");
    setFotoQuebrada(false);
    setEditandoId(p.id);
  }

  const previa = fotoUrl(arquivo);
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
              <div className="flex items-start gap-3">
                <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-sunken">
                  {previa && !fotoQuebrada ? (
                    <img
                      src={previa}
                      alt=""
                      className="h-full w-full object-contain"
                      onError={() => setFotoQuebrada(true)}
                    />
                  ) : (
                    <ImageOff className="size-5 text-ink-subtle" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Input
                    id="foto-produto"
                    value={arquivo}
                    onChange={(e) => {
                      setArquivo(e.target.value);
                      setFotoQuebrada(false);
                    }}
                    placeholder="7891234567890.jpg ou https://..."
                  />
                  <p className="text-xs text-muted-foreground">
                    {previa && fotoQuebrada
                      ? "Não consegui carregar essa imagem. Confira o nome do arquivo ou o link."
                      : "Nome do arquivo no servidor de fotos, ou o link inteiro de uma imagem."}
                  </p>
                </div>
              </div>
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
