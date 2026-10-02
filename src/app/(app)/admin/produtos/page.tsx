"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Package, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { chamar } from "@/lib/chamar";
import { mensagemErro } from "@/lib/erros";
import { Badge, ListRow, PageHeader, SearchInput } from "@/components/abastex";
import { Paginacao } from "@/components/paginacao";
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
import { ativarProduto, editarProduto, enviarFotoProduto, listarProdutos } from "@/server/produtos";

type Produto = {
  id: string;
  codigo: string;
  nome: string;
  arquivo: string | null;
  ativo: boolean;
  cod_produto: number | null;
  nome_editado: boolean;
  descricao_erp: string | null;
};

/** Código do ERP e, quando existe, o EAN — que no cadastro fica em `codigo`. */
function Codigos({ p }: { p: Produto }) {
  if (p.cod_produto == null)
    return (
      <>
        Fora do ERP · <code>{p.codigo}</code>
      </>
    );
  return (
    <>
      Cód. <code>{p.cod_produto}</code>
      {p.codigo !== String(p.cod_produto) && (
        <>
          {" "}
          · EAN <code>{p.codigo}</code>
        </>
      )}
    </>
  );
}

export default function ProdutosPage() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  const [pagina, setPagina] = useState(0);

  // Produtos vêm da system.pcprodut (sincronização diária): aqui só se edita.
  const [editando, setEditando] = useState<Produto | null>(null);
  const [nome, setNome] = useState("");
  const [arquivo, setArquivo] = useState("");
  const [fotoQuebrada, setFotoQuebrada] = useState(false);
  // Foto arrastada ainda não enviada: só sobe ao salvar, então cancelar não deixa arquivo solto no S3.
  const [fotoNova, setFotoNova] = useState<File | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const inputFoto = useRef<HTMLInputElement>(null);

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
      return chamar(editarProduto(editando!.id, { nome, arquivo: foto }));
    },
    onSuccess: () => {
      toast.success("Produto atualizado.");
      setEditando(null);
      qc.invalidateQueries({ queryKey: ["admin-produtos"] });
      // O catálogo do cliente mostra nome e foto deste cadastro.
      qc.invalidateQueries({ queryKey: ["catalogo"] });
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  function abrirEdicao(p: Produto) {
    setNome(p.nome);
    setArquivo(p.arquivo ?? "");
    setFotoQuebrada(false);
    setFotoNova(null);
    setEditando(p);
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
  const podeSalvar = nome.trim() !== "" && !salvar.isPending;
  const descricaoErp = editando?.descricao_erp ?? null;
  const diferenteDoErp = descricaoErp != null && nome.trim() !== descricaoErp;

  function aoSubmeter(e: React.FormEvent) {
    e.preventDefault();
    if (podeSalvar) salvar.mutate();
  }

  const linhas = data?.linhas ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Package}
        tone="warning"
        title="Produtos"
        subtitle={`${data ? `${data.total.toLocaleString("pt-BR")} produtos, ` : "Produtos "}vindos do ERP e atualizados toda madrugada. Aqui você troca foto e descrição e escolhe quais aparecem no catálogo.`}
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
                badge={
                  (!p.ativo || p.nome_editado) && (
                    <>
                      {!p.ativo && <Badge dot>Oculto</Badge>}
                      {p.nome_editado && (
                        <Badge tone="info" dot>
                          Descrição editada
                        </Badge>
                      )}
                    </>
                  )
                }
                meta={<Codigos p={p} />}
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

        <Paginacao pagina={pagina} total={data?.total ?? 0} porPagina={PAGE} onMudar={setPagina} />
      </div>

      <Dialog open={editando !== null} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={aoSubmeter} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Editar produto</DialogTitle>
              <DialogDescription>
                Descrição e foto valem em todos os catálogos onde este produto está. Código e EAN
                vêm do ERP e não mudam aqui. Pedidos já enviados não mudam.
              </DialogDescription>
            </DialogHeader>

            {editando && (
              <p className="rounded-md bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
                <Codigos p={editando} />
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="nome-produto">Descrição</Label>
              <Input
                id="nome-produto"
                autoFocus
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
              {diferenteDoErp ? (
                <div className="flex items-center justify-between gap-3 text-xs text-ink-muted">
                  <p className="min-w-0">
                    No ERP: <span className="font-semibold text-ink">{descricaoErp}</span>. A
                    descrição editada aqui não é trocada pela do ERP na atualização da madrugada.
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setNome(descricaoErp!)}
                  >
                    <RotateCcw />
                    Usar a do ERP
                  </Button>
                </div>
              ) : (
                descricaoErp != null && (
                  <p className="text-xs text-ink-muted">
                    Igual à do ERP: acompanha as mudanças de lá toda madrugada.
                  </p>
                )
              )}
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
              <Button type="button" variant="outline" onClick={() => setEditando(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="accent" disabled={!podeSalvar}>
                {salvar.isPending ? "Salvando..." : "Salvar alterações"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
