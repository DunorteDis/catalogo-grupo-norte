import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ComponentType, type ReactNode } from "react";
import {
  Briefcase,
  Check,
  Contact,
  Copy,
  KeyRound,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  UserPlus,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { mensagemErro } from "@/lib/erros";
import { mensagemAcesso, normalizarUsuario, usuarioDeNome, validarUsuario } from "@/lib/acessos";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  atualizarAcesso,
  criarAcesso,
  criarAcessoVendedor,
  excluirAcesso,
  listarAcessos,
  resetarSenha,
} from "@/lib/acessos.functions";

export const Route = createFileRoute("/_authenticated/admin/usuarios")({
  component: UsuariosPage,
});

const CHAVE = ["acessos"];

/** Bloco de campos com cabeçalho, como no modelo de referência. */
function Secao({
  icone: Icone,
  titulo,
  children,
}: {
  icone: ComponentType<{ className?: string }>;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <header className="mb-4 flex items-center gap-2.5 border-b pb-3">
        <span className="flex size-8 items-center justify-center rounded-lg bg-muted">
          <Icone className="size-4 text-muted-foreground" />
        </span>
        <h3 className="text-sm font-semibold">{titulo}</h3>
      </header>
      {children}
    </section>
  );
}

function Campo({ id, rotulo, children }: { id: string; rotulo: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {rotulo}
      </Label>
      {children}
    </div>
  );
}

type Credenciais = { nome: string; usuario: string; senha: string };

type EmEdicao = {
  usuarioId?: string;
  vendedorId?: string;
  usuario: string;
  ehVendedor: boolean;
  nome: string;
  email: string;
  whatsapp: string;
};

function UsuariosPage() {
  const qc = useQueryClient();
  const recarregar = () => qc.invalidateQueries({ queryKey: CHAVE });

  const listar = useServerFn(listarAcessos);
  const criarFn = useServerFn(criarAcesso);
  const darAcessoFn = useServerFn(criarAcessoVendedor);
  const resetarFn = useServerFn(resetarSenha);
  const excluirFn = useServerFn(excluirAcesso);
  const atualizarFn = useServerFn(atualizarAcesso);

  const [novoAberto, setNovoAberto] = useState(false);
  const [credenciais, setCredenciais] = useState<Credenciais | null>(null);
  const [editando, setEditando] = useState<EmEdicao | null>(null);
  const [copiado, setCopiado] = useState(false);

  const [tipo, setTipo] = useState<"vendedor" | "admin">("vendedor");
  const [nome, setNome] = useState("");
  const [usuario, setUsuario] = useState("");
  // Enquanto ninguém mexer no campo, ele acompanha o nome. Depois de editado,
  // para de ser sobrescrito — a escolha manual vence.
  const [usuarioEditado, setUsuarioEditado] = useState(false);
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");

  function mudarNome(valor: string) {
    setNome(valor);
    if (!usuarioEditado) setUsuario(valor.trim() ? usuarioDeNome(valor) : "");
  }

  function limpar() {
    setTipo("vendedor");
    setNome("");
    setUsuario("");
    setUsuarioEditado(false);
    setWhatsapp("");
    setEmail("");
  }

  function mostrarCredenciais(c: Credenciais) {
    setCopiado(false);
    setCredenciais(c);
    recarregar();
  }

  const {
    data: linhas,
    isLoading,
    error: erroLista,
  } = useQuery({ queryKey: CHAVE, queryFn: () => listar() });

  const { data: distribuidoras } = useQuery({
    queryKey: ["admin-distribuidoras"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribuidoras")
        .select("id, nome, slug")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const criar = useMutation({
    mutationFn: async () =>
      criarFn({ data: { tipo, nome, usuario, email: email.trim(), whatsapp } }),
    onSuccess: (c) => {
      setNovoAberto(false);
      limpar();
      mostrarCredenciais(c);
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const darAcesso = useMutation({
    mutationFn: async (vendedorId: string) => darAcessoFn({ data: { vendedorId } }),
    onSuccess: mostrarCredenciais,
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const resetar = useMutation({
    mutationFn: async (usuarioId: string) => resetarFn({ data: { usuarioId } }),
    onSuccess: mostrarCredenciais,
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const salvarEdicao = useMutation({
    mutationFn: async (e: EmEdicao) =>
      atualizarFn({
        data: {
          ...(e.usuarioId ? { usuarioId: e.usuarioId } : {}),
          ...(e.vendedorId ? { vendedorId: e.vendedorId } : {}),
          nome: e.nome,
          email: e.email.trim(),
          whatsapp: e.whatsapp,
        },
      }),
    onSuccess: () => {
      toast.success("Dados atualizados.");
      setEditando(null);
      recarregar();
    },
    onError: (err: Error) => toast.error(mensagemErro(err)),
  });

  const remover = useMutation({
    mutationFn: async (v: { vendedorId?: string; usuarioId?: string }) => excluirFn({ data: v }),
    onSuccess: () => {
      toast.success("Acesso excluído.");
      recarregar();
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  function copiarCredenciais() {
    if (!credenciais) return;
    navigator.clipboard.writeText(
      mensagemAcesso({ ...credenciais, url: `${window.location.origin}/auth` }),
    );
    setCopiado(true);
    toast.success("Mensagem copiada. É só colar no WhatsApp.");
  }

  function copiarLink(slug: string, distribuidoraSlug: string, nomeDist: string) {
    const url = `${window.location.origin}/c/${slug}/${distribuidoraSlug}`;
    navigator.clipboard.writeText(url);
    toast.success(`Link do catálogo ${nomeDist} copiado!`);
  }

  const ehVendedor = tipo === "vendedor";
  const erroUsuario = usuario ? validarUsuario(usuario) : null;

  return (
    <div>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold">Usuários</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            O sistema gera o usuário a partir do nome e uma senha aleatória. Todo vendedor tem
            acesso próprio; excluir aqui remove o cadastro e o login juntos.
          </p>
        </div>
        <Button
          className="h-11 rounded-xl font-bold"
          onClick={() => {
            limpar();
            setNovoAberto(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo usuário
        </Button>
      </div>

      <div className="mt-6 space-y-3">
        {isLoading && (
          <p className="py-12 text-center text-sm text-muted-foreground">Carregando...</p>
        )}

        {/* Sem isto a tela ficava em branco quando a busca falhava, sem dizer nada. */}
        {erroLista && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
            <p className="text-sm font-bold text-destructive">
              Não foi possível carregar os acessos.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{mensagemErro(erroLista)}</p>
            <p className="mt-2 font-mono text-xs text-muted-foreground/70">
              {(erroLista as Error).message}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3 rounded-xl"
              onClick={() => recarregar()}
            >
              Tentar de novo
            </Button>
          </div>
        )}

        {(linhas ?? []).map((l) => {
          const v = l.vendedor;
          const semAcesso = !l.usuarioId;
          const chave = v?.id ?? l.usuarioId ?? "";
          const detalhe = [
            semAcesso ? null : l.usuario,
            v ? `${v.whatsapp} · /c/${v.slug}` : null,
            l.emailContato || null,
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <div key={chave} className="rounded-2xl border bg-card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{l.nome || l.usuario}</p>
                  <p className="truncate text-xs text-muted-foreground">{detalhe}</p>
                </div>

                <Badge variant={semAcesso ? "destructive" : l.admin ? "default" : "secondary"}>
                  {semAcesso ? "Sem acesso" : l.admin ? "Administrador" : "Vendedor"}
                </Badge>

                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() =>
                    setEditando({
                      ...(l.usuarioId ? { usuarioId: l.usuarioId } : {}),
                      ...(v ? { vendedorId: v.id } : {}),
                      usuario: l.usuario,
                      ehVendedor: !!v,
                      nome: l.nome,
                      email: l.emailContato,
                      whatsapp: v?.whatsapp ?? "",
                    })
                  }
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </Button>

                {semAcesso && v ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    disabled={darAcesso.isPending}
                    onClick={() => darAcesso.mutate(v.id)}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Criar acesso
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    disabled={resetar.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Gerar uma nova senha para ${l.nome || l.usuario}? A senha atual deixa de valer.`,
                        )
                      )
                        resetar.mutate(l.usuarioId!);
                    }}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Resetar senha
                  </Button>
                )}

                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => {
                    if (window.confirm(`Excluir ${l.nome || l.usuario}?`))
                      remover.mutate(v ? { vendedorId: v.id } : { usuarioId: l.usuarioId! });
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {v && (distribuidoras ?? []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
                  {(distribuidoras ?? []).map((d) => (
                    <Button
                      key={d.id}
                      size="sm"
                      variant="secondary"
                      className="rounded-xl"
                      onClick={() => copiarLink(v.slug, d.slug, d.nome)}
                    >
                      <Copy className="mr-2 h-3.5 w-3.5" />
                      {d.nome}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {!isLoading && !erroLista && linhas?.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Nenhum acesso cadastrado ainda.
          </p>
        )}
      </div>

      {/* Novo usuário */}
      <Dialog open={novoAberto} onOpenChange={setNovoAberto}>
        <DialogContent className={cn("sm:max-w-2xl", !ehVendedor && "sm:max-w-md")}>
          <DialogHeader>
            <DialogTitle>Novo usuário</DialogTitle>
            <DialogDescription>
              O usuário e a senha são gerados ao salvar. Vendedor recebe cadastro e login juntos.
            </DialogDescription>
          </DialogHeader>

          <form
            id="form-novo-usuario"
            onSubmit={(e) => {
              e.preventDefault();
              criar.mutate();
            }}
            className={cn("grid gap-4", ehVendedor && "sm:grid-cols-2")}
          >
            <div className="space-y-4">
              <Secao icone={Briefcase} titulo="Tipo de acesso">
                <RadioGroup
                  value={tipo}
                  onValueChange={(v) => setTipo(v as typeof tipo)}
                  className="flex flex-wrap gap-6"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="vendedor" id="tipo-vendedor" />
                    <Label htmlFor="tipo-vendedor">Vendedor</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="admin" id="tipo-admin" />
                    <Label htmlFor="tipo-admin">Administrador</Label>
                  </div>
                </RadioGroup>
              </Secao>

              <Secao icone={UserRound} titulo="Identificação">
                <div className="grid gap-3">
                  <Campo id="nome" rotulo="Nome">
                    <Input
                      id="nome"
                      value={nome}
                      onChange={(e) => mudarNome(e.target.value)}
                      required
                      minLength={2}
                      placeholder="Nome completo"
                      className="h-11 rounded-xl"
                    />
                  </Campo>
                  <Campo id="usuario" rotulo="Usuário (é o login)">
                    <Input
                      id="usuario"
                      value={usuario}
                      onChange={(e) => {
                        setUsuarioEditado(true);
                        setUsuario(normalizarUsuario(e.target.value));
                      }}
                      required
                      placeholder="primeiro.ultimo"
                      aria-invalid={!!erroUsuario}
                      className="h-11 rounded-xl font-mono"
                    />
                    <p
                      className={cn(
                        "text-xs",
                        erroUsuario ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {erroUsuario ?? "Sugerido pelo nome. Edite se quiser outro."}
                    </p>
                  </Campo>
                  <Campo id="email" rotulo="E-mail (opcional)">
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Só para contato"
                      className="h-11 rounded-xl"
                    />
                  </Campo>
                </div>
              </Secao>
            </div>

            {ehVendedor && (
              <Secao icone={Contact} titulo="Dados do vendedor">
                <div className="grid gap-3">
                  <Campo id="whatsapp" rotulo="WhatsApp (com DDD)">
                    <Input
                      id="whatsapp"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      required
                      placeholder="92991234567"
                      className="h-11 rounded-xl"
                    />
                  </Campo>
                  <p className="text-xs text-muted-foreground">
                    O pedido do cliente chega neste número. O link do catálogo é gerado ao salvar.
                  </p>
                </div>
              </Secao>
            )}
          </form>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNovoAberto(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="form-novo-usuario"
              disabled={criar.isPending || !!erroUsuario}
            >
              {criar.isPending ? "Criando..." : "Criar acesso"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar — o usuário fica visível mas travado: é o login */}
      <Dialog open={!!editando} onOpenChange={(a) => !a && setEditando(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar {editando?.nome}</DialogTitle>
            <DialogDescription>
              O usuário não muda — é com ele que a pessoa entra no sistema.
            </DialogDescription>
          </DialogHeader>

          <form
            id="form-editar"
            onSubmit={(e) => {
              e.preventDefault();
              if (editando) salvarEdicao.mutate(editando);
            }}
          >
            <Secao icone={UserRound} titulo="Identificação">
              <div className="grid gap-3">
                <Campo id="edit-usuario" rotulo="Usuário (não editável)">
                  <Input
                    id="edit-usuario"
                    value={editando?.usuario ?? ""}
                    placeholder="ainda sem acesso"
                    readOnly
                    disabled
                    className="h-11 rounded-xl font-mono"
                  />
                </Campo>
                <Campo id="edit-nome" rotulo="Nome">
                  <Input
                    id="edit-nome"
                    value={editando?.nome ?? ""}
                    onChange={(e) => setEditando((v) => (v ? { ...v, nome: e.target.value } : v))}
                    required
                    minLength={2}
                    className="h-11 rounded-xl"
                  />
                </Campo>
                <Campo id="edit-email" rotulo="E-mail (opcional)">
                  <Input
                    id="edit-email"
                    type="email"
                    value={editando?.email ?? ""}
                    onChange={(e) => setEditando((v) => (v ? { ...v, email: e.target.value } : v))}
                    placeholder="Só para contato"
                    className="h-11 rounded-xl"
                  />
                </Campo>
                {editando?.ehVendedor && (
                  <Campo id="edit-whatsapp" rotulo="WhatsApp (com DDD)">
                    <Input
                      id="edit-whatsapp"
                      value={editando.whatsapp}
                      onChange={(e) =>
                        setEditando((v) => (v ? { ...v, whatsapp: e.target.value } : v))
                      }
                      required
                      className="h-11 rounded-xl"
                    />
                  </Campo>
                )}
              </div>
            </Secao>
          </form>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button type="submit" form="form-editar" disabled={salvarEdicao.isPending}>
              {salvarEdicao.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credenciais geradas — na criação e no reset */}
      <Dialog open={!!credenciais} onOpenChange={(a) => !a && setCredenciais(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Acesso de {credenciais?.nome}</DialogTitle>
            <DialogDescription>
              Anote ou copie agora: a senha não fica visível depois. Se perder, é só resetar.
            </DialogDescription>
          </DialogHeader>

          <Secao icone={KeyRound} titulo="Credenciais">
            <dl className="grid gap-3">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Usuário</dt>
                <dd className="mt-1 rounded-xl border bg-muted/40 px-3 py-2.5 font-mono text-sm font-semibold">
                  {credenciais?.usuario}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Senha</dt>
                <dd className="mt-1 rounded-xl border bg-muted/40 px-3 py-2.5 font-mono text-lg font-bold tracking-[0.2em]">
                  {credenciais?.senha}
                </dd>
              </div>
            </dl>
          </Secao>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCredenciais(null)}>
              Fechar
            </Button>
            <Button type="button" onClick={copiarCredenciais}>
              {copiado ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copiado ? "Copiado" : "Copiar para WhatsApp"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
