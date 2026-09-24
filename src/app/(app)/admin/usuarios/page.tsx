"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
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
  TriangleAlert,
  UserPlus,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { useCatalogosPublicos } from "@/hooks/use-catalogos-publicos";
import { useCopiado } from "@/hooks/use-copiado";
import { chamar } from "@/lib/chamar";
import { mensagemErro } from "@/lib/erros";
import { mensagemAcesso, normalizarUsuario, usuarioDeNome, validarUsuario } from "@/lib/acessos";
import { cn } from "@/lib/utils";
import { Badge, Chip, IconTile, PageHeader } from "@/components/abastex";
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
} from "@/server/acessos";

const CHAVE = ["acessos"];

/** "eduardo.oliveira" → "EO"; nome de uma palavra só usa as duas primeiras letras. */
function iniciais(nome: string) {
  const partes = nome
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  const primeira = partes[0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1]! : "";
  return ultima ? primeira[0]! + ultima[0]! : primeira.slice(0, 2);
}

/** Bloco de campos com cabeçalho, como no modelo de referência. */
function Secao({
  icone,
  titulo,
  children,
}: {
  icone: LucideIcon;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-4">
      <header className="mb-4 flex items-center gap-2.5 border-b pb-3">
        <IconTile icon={icone} tone="brand" size="sm" />
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

export default function UsuariosPage() {
  const qc = useQueryClient();
  const recarregar = () => qc.invalidateQueries({ queryKey: CHAVE });

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
  } = useQuery({ queryKey: CHAVE, queryFn: () => chamar(listarAcessos()) });

  // Mesma lista (e mesmo cache) do painel do vendedor: distribuidoras e
  // catálogos personalizados, para o admin copiar qualquer link.
  const { data: catalogos } = useCatalogosPublicos();

  const criar = useMutation({
    mutationFn: () => chamar(criarAcesso({ tipo, nome, usuario, email: email.trim(), whatsapp })),
    onSuccess: (c) => {
      setNovoAberto(false);
      limpar();
      mostrarCredenciais(c);
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const darAcesso = useMutation({
    mutationFn: (vendedorId: string) => chamar(criarAcessoVendedor(vendedorId)),
    onSuccess: mostrarCredenciais,
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const resetar = useMutation({
    mutationFn: (usuarioId: string) => chamar(resetarSenha(usuarioId)),
    onSuccess: mostrarCredenciais,
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const salvarEdicao = useMutation({
    mutationFn: (e: EmEdicao) =>
      chamar(
        atualizarAcesso({
          ...(e.usuarioId ? { usuarioId: e.usuarioId } : {}),
          ...(e.vendedorId ? { vendedorId: e.vendedorId } : {}),
          nome: e.nome,
          email: e.email.trim(),
          whatsapp: e.whatsapp,
        }),
      ),
    onSuccess: () => {
      toast.success("Dados atualizados.");
      setEditando(null);
      recarregar();
    },
    onError: (err: Error) => toast.error(mensagemErro(err)),
  });

  const remover = useMutation({
    mutationFn: (v: { vendedorId?: string; usuarioId?: string }) => chamar(excluirAcesso(v)),
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

  const [linkCopiado, copiarLink] = useCopiado();

  const ehVendedor = tipo === "vendedor";
  const erroUsuario = usuario ? validarUsuario(usuario) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={["Abastex", "Usuários"]}
        icon={Users}
        tone="brand"
        title="Usuários"
        subtitle="O sistema gera o usuário a partir do nome e uma senha aleatória. Excluir aqui remove o cadastro e o login juntos."
        actions={
          <Button
            onClick={() => {
              limpar();
              setNovoAberto(true);
            }}
          >
            <Plus />
            Novo usuário
          </Button>
        }
      />

      <div className="flex flex-col gap-3">
        {isLoading && <p className="py-12 text-center text-sm text-ink-muted">Carregando...</p>}

        {/* Sem isto a tela ficava em branco quando a busca falhava, sem dizer nada. */}
        {erroLista && (
          <div className="rounded-2xl border border-danger/30 bg-danger-soft p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-danger">
              <TriangleAlert className="size-4" />
              Não foi possível carregar os acessos.
            </p>
            <p className="mt-1 text-sm text-ink-muted">{mensagemErro(erroLista)}</p>
            <p className="mt-2 font-mono text-xs text-ink-subtle">{(erroLista as Error).message}</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => recarregar()}>
              Tentar de novo
            </Button>
          </div>
        )}

        {(linhas ?? []).map((l) => {
          const v = l.vendedor;
          const semAcesso = !l.usuarioId;
          const chave = v?.id ?? l.usuarioId ?? "";
          const nomeExibido = l.nome || l.usuario;

          return (
            <article key={chave} className="rounded-2xl border bg-card px-5 py-4 shadow-card">
              <div className="flex flex-wrap items-center gap-4">
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold uppercase",
                    semAcesso
                      ? "bg-surface-sunken text-ink-muted"
                      : l.admin
                        ? "bg-primary text-primary-foreground"
                        : "bg-mint text-on-mint",
                  )}
                  aria-hidden
                >
                  {iniciais(nomeExibido)}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    <span className="truncate">{nomeExibido}</span>
                    {semAcesso ? (
                      <Badge tone="danger" icon={TriangleAlert}>
                        Sem acesso
                      </Badge>
                    ) : (
                      <Badge tone={l.admin ? "brand" : "accent"} solid>
                        {l.admin ? "Administrador" : "Vendedor"}
                      </Badge>
                    )}
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-muted">
                    {!semAcesso && <span className="font-mono">{l.usuario}</span>}
                    {v && <span className="font-mono">/c/{v.slug}</span>}
                    {v && <span>{v.whatsapp}</span>}
                    {l.emailContato && <span>{l.emailContato}</span>}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
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
                    <Pencil />
                    Editar
                  </Button>

                  {semAcesso && v ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={darAcesso.isPending}
                      onClick={() => darAcesso.mutate(v.id)}
                    >
                      <UserPlus />
                      Criar acesso
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={resetar.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Gerar uma nova senha para ${nomeExibido}? A senha atual deixa de valer.`,
                          )
                        )
                          resetar.mutate(l.usuarioId!);
                      }}
                    >
                      <RotateCcw />
                      Resetar senha
                    </Button>
                  )}

                  <Button
                    size="icon-sm"
                    variant="danger"
                    aria-label={`Excluir ${nomeExibido}`}
                    title="Excluir usuário"
                    onClick={() => {
                      if (window.confirm(`Excluir ${nomeExibido}?`))
                        remover.mutate(v ? { vendedorId: v.id } : { usuarioId: l.usuarioId! });
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>

              {v && (catalogos ?? []).length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                  {(catalogos ?? []).map((c) => {
                    const chaveLink = `${v.id}:${c.id}`;
                    return (
                      <Chip
                        key={c.id}
                        tone={c.personalizado ? "brand" : "neutral"}
                        icon={linkCopiado === chaveLink ? Check : Copy}
                        color={c.personalizado ? undefined : c.cor}
                        title={`Copiar o link de ${v.nome} para ${c.nome}`}
                        onClick={() =>
                          copiarLink(chaveLink, `${window.location.origin}/c/${v.slug}/${c.slug}`)
                        }
                        className="h-8 text-xs"
                      >
                        {c.emoji ? `${c.emoji} ${c.nome}` : c.nome}
                      </Chip>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}

        {!isLoading && !erroLista && linhas?.length === 0 && (
          <p className="py-12 text-center text-sm text-ink-muted">
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
                      className="font-mono"
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
              variant="accent"
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
                    className="font-mono"
                  />
                </Campo>
                <Campo id="edit-nome" rotulo="Nome">
                  <Input
                    id="edit-nome"
                    value={editando?.nome ?? ""}
                    onChange={(e) => setEditando((v) => (v ? { ...v, nome: e.target.value } : v))}
                    required
                    minLength={2}
                  />
                </Campo>
                <Campo id="edit-email" rotulo="E-mail (opcional)">
                  <Input
                    id="edit-email"
                    type="email"
                    value={editando?.email ?? ""}
                    onChange={(e) => setEditando((v) => (v ? { ...v, email: e.target.value } : v))}
                    placeholder="Só para contato"
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
            <Button
              type="submit"
              variant="accent"
              form="form-editar"
              disabled={salvarEdicao.isPending}
            >
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
                <dd className="mt-1 rounded-md bg-surface-sunken px-3 py-2.5 font-mono text-sm font-semibold">
                  {credenciais?.usuario}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Senha</dt>
                <dd className="mt-1 rounded-md bg-surface-sunken px-3 py-2.5 font-mono text-lg font-bold tracking-[0.2em]">
                  {credenciais?.senha}
                </dd>
              </div>
            </dl>
          </Secao>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCredenciais(null)}>
              Fechar
            </Button>
            <Button type="button" variant="accent" onClick={copiarCredenciais}>
              {copiado ? <Check /> : <Copy />}
              {copiado ? "Copiado" : "Copiar para WhatsApp"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
