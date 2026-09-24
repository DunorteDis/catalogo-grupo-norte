"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ImageOff, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { chamar } from "@/lib/chamar";
import { mensagemErro } from "@/lib/erros";
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

  return (
    <div>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold">Produtos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data?.total ?? 0} produtos cadastrados. Desative os que não devem aparecer no catálogo.
          </p>
        </div>
        <Button className="h-11 rounded-xl font-bold" onClick={abrirNovo}>
          <Plus className="mr-2 h-4 w-4" />
          Novo produto
        </Button>
      </div>

      <Input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por nome ou código"
        className="mt-4 h-11 max-w-md rounded-xl"
      />

      <div className="mt-4 divide-y rounded-2xl border bg-card">
        {(data?.linhas ?? []).map((p) => (
          <div key={p.id} className="flex items-center gap-3 p-3">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted/40">
              {fotoUrl(p.arquivo) && (
                <img
                  src={fotoUrl(p.arquivo)!}
                  alt={p.nome}
                  loading="lazy"
                  className="h-full w-full object-contain"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{p.nome}</p>
              <p className="text-xs text-muted-foreground">
                Cód. {p.codigo}
                {/* O cadastro espelha o ERP, onde o mesmo código aparece mais de
                    uma vez: a empresa é o que separa boa parte das repetições. */}
                {p.cod_empresa != null && ` · Empresa ${p.cod_empresa}`}
              </p>
            </div>
            <Switch
              checked={!!p.ativo}
              onCheckedChange={(v) => alternar.mutate({ id: p.id, ativo: v })}
            />
            <Button
              size="icon"
              variant="ghost"
              title="Editar produto"
              onClick={() => abrirEdicao(p)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="text-destructive"
              title="Excluir do cadastro"
              onClick={() => setAExcluir(p)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Button
          variant="outline"
          disabled={pagina === 0}
          onClick={() => setPagina((p) => Math.max(0, p - 1))}
        >
          Anterior
        </Button>
        <span className="text-xs text-muted-foreground">Página {pagina + 1}</span>
        <Button
          variant="outline"
          disabled={(data?.linhas.length ?? 0) < PAGE}
          onClick={() => setPagina((p) => p + 1)}
        >
          Próxima
        </Button>
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
                className="h-11 rounded-xl font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nome-produto">Nome</Label>
              <Input
                id="nome-produto"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: CD ORAL B EXTRA FRESH 3X70G"
                className="h-11 rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="foto-produto">Foto (opcional)</Label>
              <div className="flex items-start gap-3">
                <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/40">
                  {previa && !fotoQuebrada ? (
                    <img
                      src={previa}
                      alt=""
                      className="h-full w-full object-contain"
                      onError={() => setFotoQuebrada(true)}
                    />
                  ) : (
                    <ImageOff className="h-5 w-5 text-muted-foreground" />
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
                    className="h-11 rounded-xl"
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
              <Button type="submit" className="rounded-xl font-bold" disabled={!podeSalvar}>
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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
