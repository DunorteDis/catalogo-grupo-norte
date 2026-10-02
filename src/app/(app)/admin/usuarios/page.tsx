"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  Briefcase,
  Check,
  Contact,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  MessageCircle,
  Pencil,
  Plus,
  RotateCcw,
  Store,
  WalletCards,
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
import { confirmar } from "@/lib/confirmar";
import { copiarTexto } from "@/lib/copiar";
import { mensagemErro } from "@/lib/erros";
import {
  iniciais,
  mensagemAcesso,
  normalizarUsuario,
  usuarioDeNome,
  validarUsuario,
} from "@/lib/acessos";
import { formatarTelefone, slugify, somenteDigitos } from "@/lib/catalogo";
import { LOGOS } from "@/lib/logos";
import { cn } from "@/lib/utils";
import { Badge, IconTile, PageHeader } from "@/components/abastex";
import { ConexaoWhatsapp } from "@/components/whatsapp/conexao";
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
  vendedoresWinthor,
} from "@/server/acessos";

import { CarteiraVendedor } from "./carteira";

const CHAVE = ["acessos"];

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

type VendedorWinthor = {
  codusur: number;
  nomeErp: string;
  nome: string;
  email: string;
  whatsapp: string;
  cadastrado: boolean;
};

/**
 * Campo Nome com sugestões dos vendedores internos do Winthor, por nome ou codusur.
 * Digitar livre continua valendo: por enquanto dá para cadastrar quem não está lá.
 * O foco fica no campo; setas, Enter e Esc navegam a lista.
 */
function NomeComBusca({
  valor,
  onDigitar,
  opcoes,
  onEscolher,
}: {
  valor: string;
  onDigitar: (nome: string) => void;
  opcoes: VendedorWinthor[] | undefined;
  onEscolher: (v: VendedorWinthor) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const palavras = slugify(valor).split("-").filter(Boolean);
  const sugestoes =
    palavras.length === 0
      ? []
      : (opcoes ?? [])
          .filter((o) => {
            const alvo = `${slugify(o.nomeErp)}-${o.codusur}`;
            return palavras.every((p) => alvo.includes(p));
          })
          .slice(0, 8);
  const mostrar = aberto && sugestoes.length > 0;

  function escolher(o: VendedorWinthor) {
    onEscolher(o);
    setAberto(false);
  }

  return (
    <div className="relative">
      <Input
        id="nome"
        value={valor}
        onChange={(e) => {
          onDigitar(e.target.value);
          setAtivo(0);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => setAberto(false)}
        onKeyDown={(e) => {
          if (!mostrar) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const passo = e.key === "ArrowDown" ? 1 : -1;
            setAtivo((i) => (i + passo + sugestoes.length) % sugestoes.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            escolher(sugestoes[ativo] ?? sugestoes[0]!);
          } else if (e.key === "Escape") {
            setAberto(false);
          }
        }}
        role="combobox"
        aria-expanded={mostrar}
        aria-controls="nome-sugestoes"
        aria-autocomplete="list"
        aria-activedescendant={mostrar ? `nome-sugestao-${sugestoes[ativo]?.codusur}` : undefined}
        autoComplete="off"
        required
        minLength={2}
        placeholder="Busque no Winthor ou digite o nome"
      />
      {mostrar && (
        <ul
          id="nome-sugestoes"
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border bg-popover p-1 shadow-float"
        >
          {sugestoes.map((o, i) => (
            <li
              key={o.codusur}
              id={`nome-sugestao-${o.codusur}`}
              role="option"
              aria-selected={i === ativo}
              // mousedown tiraria o foco do campo e fecharia a lista antes do clique
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setAtivo(i)}
              onClick={() => escolher(o)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm",
                i === ativo && "bg-surface-hover",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{o.nomeErp}</span>
              {o.cadastrado && <Badge tone="warning">já cadastrado</Badge>}
              <span className="font-mono text-xs text-ink-muted">{o.codusur}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Um link do vendedor: faixa e símbolo na cor do catálogo, copiar e abrir. */
function CartaoLink({
  titulo,
  caminho,
  cor,
  simbolo,
  copiado,
  onCopiar,
}: {
  titulo: string;
  caminho: string;
  cor: string;
  simbolo: ReactNode;
  copiado: boolean;
  onCopiar: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl border bg-card p-3"
      style={{ borderLeft: `4px solid ${cor}` }}
    >
      <span
        className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg text-lg font-bold"
        style={{ background: `color-mix(in srgb, ${cor} 14%, transparent)`, color: cor }}
        aria-hidden
      >
        {simbolo}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{titulo}</p>
        <p className="truncate font-mono text-xs text-ink-muted">{caminho}</p>
      </div>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Copiar o link de ${titulo}`}
        title={copiado ? "Copiado" : "Copiar link"}
        onClick={onCopiar}
        className={cn(copiado && "text-mint-ink")}
      >
        {copiado ? <Check /> : <Copy />}
      </Button>
      <Button size="icon-sm" variant="ghost" asChild>
        <a
          href={caminho}
          target="_blank"
          rel="noreferrer"
          aria-label={`Abrir ${titulo}`}
          title="Abrir"
        >
          <ExternalLink />
        </a>
      </Button>
    </div>
  );
}

type LinhaVendedor = {
  id: string;
  nome: string;
  slug: string;
  whatsapp: string;
  codusur: number | null;
};

type Credenciais = { nome: string; usuario: string; senha: string };

type EmEdicao = {
  usuarioId?: string;
  vendedorId?: string;
  usuario: string;
  ehVendedor: boolean;
  nome: string;
  email: string;
  whatsapp: string;
  codusur: string;
};

export default function UsuariosPage() {
  const qc = useQueryClient();
  const recarregar = () => qc.invalidateQueries({ queryKey: CHAVE });

  const [novoAberto, setNovoAberto] = useState(false);
  const [credenciais, setCredenciais] = useState<Credenciais | null>(null);
  const [editando, setEditando] = useState<EmEdicao | null>(null);
  const [copiado, setCopiado] = useState(false);
  // O último vendedor fica guardado ao fechar: o conteúdo não some durante a animação.
  const [links, setLinks] = useState<LinhaVendedor | null>(null);
  const [linksAberto, setLinksAberto] = useState(false);
  const [carteira, setCarteira] = useState<LinhaVendedor | null>(null);
  const [carteiraAberta, setCarteiraAberta] = useState(false);
  const [conexao, setConexao] = useState<LinhaVendedor | null>(null);
  const [conexaoAberta, setConexaoAberta] = useState(false);

  const [tipo, setTipo] = useState<"vendedor" | "admin">("vendedor");
  const [nome, setNome] = useState("");
  const [usuario, setUsuario] = useState("");
  // Enquanto ninguém mexer no campo, ele acompanha o nome. Depois de editado,
  // para de ser sobrescrito — a escolha manual vence.
  const [usuarioEditado, setUsuarioEditado] = useState(false);
  const [whatsapp, setWhatsapp] = useState("");
  const [codusur, setCodusur] = useState("");
  const [email, setEmail] = useState("");

  function mudarNome(valor: string) {
    setNome(valor);
    if (!usuarioEditado) setUsuario(valor.trim() ? usuarioDeNome(valor) : "");
  }

  // Escolher no Winthor sobrescreve só o que o ERP tem; o resto fica como estava.
  function escolherDoWinthor(v: VendedorWinthor) {
    mudarNome(v.nome);
    if (v.email) setEmail(v.email);
    if (v.whatsapp) setWhatsapp(v.whatsapp);
    setCodusur(String(v.codusur));
  }

  function limpar() {
    setTipo("vendedor");
    setNome("");
    setUsuario("");
    setUsuarioEditado(false);
    setWhatsapp("");
    setCodusur("");
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

  // Mesma lista (e mesmo cache) do painel do vendedor, para o admin copiar
  // qualquer link. Todo vendedor daqui é da mesma distribuidora, então os
  // catálogos no ar de um vendedor ativo valem para todos.
  // Só busca com o cadastro aberto; a lista é pequena (dezenas) e o filtro é no navegador.
  const winthor = useQuery({
    queryKey: ["vendedores-winthor"],
    queryFn: () => chamar(vendedoresWinthor()),
    enabled: novoAberto,
  });

  const umVendedorAtivo = linhas?.find((l) => l.vendedor?.ativo)?.vendedor?.slug;
  const { data: catalogos } = useCatalogosPublicos(umVendedorAtivo);

  const criar = useMutation({
    mutationFn: () =>
      chamar(criarAcesso({ tipo, nome, usuario, email: email.trim(), whatsapp, codusur })),
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
          ...(e.vendedorId ? { vendedorId: e.vendedorId, codusur: e.codusur } : {}),
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

  async function copiarCredenciais() {
    if (!credenciais) return;
    const ok = await copiarTexto(
      mensagemAcesso({ ...credenciais, url: `${window.location.origin}/auth` }),
    );
    if (!ok) {
      toast.error("Não foi possível copiar. Anote o usuário e a senha que aparecem aqui.");
      return;
    }
    setCopiado(true);
    toast.success("Mensagem copiada. É só colar no WhatsApp.");
  }

  const [linkCopiado, copiarLink] = useCopiado();

  const ehVendedor = tipo === "vendedor";
  const erroUsuario = usuario ? validarUsuario(usuario) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
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

                <div className="min-w-0 flex-[1_1_240px]">
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
                    {v && <span>{formatarTelefone(v.whatsapp)}</span>}
                    {v?.codusur != null && (
                      <span className="rounded-full bg-info-soft px-2 font-medium text-info">
                        cód. usuário {v.codusur}
                      </span>
                    )}
                    {l.emailContato && <span>{l.emailContato}</span>}
                  </p>
                </div>

                <div className="ml-auto flex flex-wrap items-center gap-1">
                  {v && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="bg-info-soft text-info hover:bg-info-soft hover:text-info hover:brightness-95"
                        onClick={() => {
                          setLinks(v);
                          setLinksAberto(true);
                        }}
                      >
                        <Link2 />
                        Links
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={cn(
                          "hover:brightness-95",
                          v.codusur != null
                            ? "bg-mint-soft text-mint-ink hover:bg-mint-soft hover:text-mint-ink"
                            : "bg-surface-sunken text-ink-subtle hover:bg-surface-sunken hover:text-ink-subtle",
                        )}
                        onClick={() => {
                          if (v.codusur == null) {
                            toast.info(
                              "Informe o cód. usuário no Winthor em Editar para ver a carteira.",
                            );
                            return;
                          }
                          setCarteira(v);
                          setCarteiraAberta(true);
                        }}
                      >
                        <WalletCards />
                        Carteira
                        {v.clientes != null && (
                          <span className="rounded-full bg-mint-ink/15 px-1.5 text-xs tabular-nums">
                            {v.clientes.toLocaleString("pt-BR")}
                          </span>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="bg-success-soft text-success hover:bg-success-soft hover:text-success hover:brightness-95"
                        onClick={() => {
                          setConexao(v);
                          setConexaoAberta(true);
                        }}
                      >
                        <MessageCircle />
                        WhatsApp
                      </Button>
                    </>
                  )}
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
                        codusur: v?.codusur != null ? String(v.codusur) : "",
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
                      onClick={async () => {
                        if (
                          await confirmar(
                            `Gerar uma nova senha para ${nomeExibido}? A senha atual deixa de valer.`,
                            "Gerar senha",
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
                    onClick={async () => {
                      if (await confirmar(`Excluir ${nomeExibido}?`, "Excluir"))
                        remover.mutate(v ? { vendedorId: v.id } : { usuarioId: l.usuarioId! });
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
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
        <DialogContent
          className={cn("sm:max-w-2xl", !ehVendedor && "sm:max-w-md")}
          // Esc com a lista de sugestões aberta fecha só a lista, não o cadastro.
          onEscapeKeyDown={(e) => {
            if (document.activeElement?.getAttribute("aria-expanded") === "true")
              e.preventDefault();
          }}
        >
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
                    <NomeComBusca
                      valor={nome}
                      onDigitar={mudarNome}
                      opcoes={winthor.data}
                      onEscolher={escolherDoWinthor}
                    />
                    <p
                      className={cn(
                        "text-xs",
                        winthor.isError ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {winthor.isError
                        ? "Não foi possível buscar os vendedores do Winthor. Digite o nome."
                        : "Busque o vendedor interno do Winthor pelo nome ou código, ou digite outro nome."}
                    </p>
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
                  <Campo id="codusur" rotulo="Cód. usuário no Winthor (opcional)">
                    <Input
                      id="codusur"
                      value={codusur}
                      onChange={(e) => setCodusur(somenteDigitos(e.target.value))}
                      inputMode="numeric"
                      maxLength={5}
                      placeholder="Ex.: 123"
                      className="font-mono"
                    />
                  </Campo>
                  <p className="text-xs text-muted-foreground">
                    Liga o vendedor à carteira de clientes dele no Winthor.
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
                {editando?.ehVendedor && (
                  <Campo id="edit-codusur" rotulo="Cód. usuário no Winthor (opcional)">
                    <Input
                      id="edit-codusur"
                      value={editando.codusur}
                      onChange={(e) =>
                        setEditando((v) =>
                          v ? { ...v, codusur: somenteDigitos(e.target.value) } : v,
                        )
                      }
                      inputMode="numeric"
                      maxLength={5}
                      placeholder="Ex.: 123"
                      className="font-mono"
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

      {/* Links do vendedor: a página onde o cliente escolhe o catálogo e um link por catálogo */}
      <Dialog open={linksAberto} onOpenChange={setLinksAberto}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Links de {links?.nome}</DialogTitle>
            <DialogDescription>
              Mande o link para o cliente. O pedido chega no WhatsApp{" "}
              {links && formatarTelefone(links.whatsapp)}.
            </DialogDescription>
          </DialogHeader>

          {links && (
            <div className="grid gap-4">
              <CartaoLink
                titulo="Todos os catálogos"
                caminho={`/c/${links.slug}`}
                cor="var(--brand)"
                simbolo={<Store className="size-5" />}
                copiado={linkCopiado === `${links.id}:pagina`}
                onCopiar={() =>
                  copiarLink(`${links.id}:pagina`, `${window.location.origin}/c/${links.slug}`)
                }
              />

              <div className="grid gap-2 sm:grid-cols-2">
                {(catalogos ?? []).map((c) => (
                  <CartaoLink
                    key={c.id}
                    titulo={c.nome}
                    caminho={`/c/${links.slug}/${c.slug}`}
                    cor={c.personalizado || !c.cor ? "var(--brand)" : c.cor}
                    simbolo={
                      c.emoji ??
                      ((LOGOS[c.slug] ?? c.logo_url) ? (
                        <img
                          src={LOGOS[c.slug] ?? c.logo_url!}
                          alt=""
                          className="size-full object-contain p-1"
                        />
                      ) : (
                        c.nome.charAt(0)
                      ))
                    }
                    copiado={linkCopiado === `${links.id}:${c.id}`}
                    onCopiar={() =>
                      copiarLink(
                        `${links.id}:${c.id}`,
                        `${window.location.origin}/c/${links.slug}/${c.slug}`,
                      )
                    }
                  />
                ))}
              </div>

              {catalogos && catalogos.length === 0 && (
                <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning">
                  Nenhum catálogo no ar nesta distribuidora. Ligue um em Catálogos.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* WhatsApp do vendedor: instância da W-API, QR code e estado da conexão */}
      <Dialog open={conexaoAberta} onOpenChange={setConexaoAberta}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>WhatsApp de {conexao?.nome}</DialogTitle>
            <DialogDescription>
              As conversas desse número aparecem no CRM do vendedor e no histórico dos pedidos.
            </DialogDescription>
          </DialogHeader>
          {conexao && <ConexaoWhatsapp key={conexao.id} vendedorId={conexao.id} />}
        </DialogContent>
      </Dialog>

      <CarteiraVendedor
        key={carteira?.id}
        vendedor={carteira}
        aberto={carteiraAberta}
        onFechar={() => setCarteiraAberta(false)}
      />

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
