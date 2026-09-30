"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Ban, Contact, Landmark, Pencil, Store, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { chamar } from "@/lib/chamar";
import { confirmar } from "@/lib/confirmar";
import { mensagemErro } from "@/lib/erros";
import {
  formatarTelefone,
  numeroNacional,
  PAGINA_CLIENTES as PAGE,
  TIPOS_CONTATO,
} from "@/lib/catalogo";
import { Badge, FilterTabs, ListRow, PageHeader, SearchInput } from "@/components/abastex";
import { CondicoesCliente } from "@/components/condicoes-cliente";
import { Paginacao } from "@/components/paginacao";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  contatosDoCliente,
  excluirContato,
  listarClientes,
  salvarContato,
  type Cliente,
  type Situacao,
} from "@/server/clientes";

const ABAS: { value: Situacao; label: string }[] = [
  { value: "ativos", label: "Ativos" },
  { value: "inativos", label: "Inativos" },
  { value: "todos", label: "Todos" },
];

type TipoContato = (typeof TIPOS_CONTATO)[number];

function Dados({ c }: { c: Cliente }) {
  return (
    <>
      Cód. <code>{c.codcli}</code>
      {c.cgcent && <> · {c.cgcent}</>}
      {c.municent && (
        <>
          {" "}
          · {c.municent}
          {c.estent && `/${c.estent}`}
        </>
      )}
    </>
  );
}

export default function ClientesPage() {
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  const [situacao, setSituacao] = useState<Situacao>("ativos");
  const [pagina, setPagina] = useState(0);
  const [aberto, setAberto] = useState<Cliente | null>(null);
  // O último cliente fica guardado ao fechar: o conteúdo não some durante a animação.
  const [condicoes, setCondicoes] = useState<number | null>(null);
  const [condicoesAbertas, setCondicoesAbertas] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setTermo(busca.trim());
      setPagina(0);
    }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  const { data } = useQuery({
    queryKey: ["admin-clientes", termo, situacao, pagina],
    queryFn: () => chamar(listarClientes(termo, situacao, pagina)),
  });

  const linhas = data?.linhas ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={["Abastex", "Clientes"]}
        icon={Store}
        tone="info"
        title="Clientes"
        subtitle={`${data ? `${data.total.toLocaleString("pt-BR")} ${data.total === 1 ? "cliente" : "clientes"} ` : "Clientes "}do ERP. Aqui você acrescenta contatos com nome e celular, para saber de que cliente é quem chama no WhatsApp.`}
      />

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, fantasia, código ou CNPJ"
            className="flex-1"
          />
          <FilterTabs
            options={ABAS}
            value={situacao}
            onChange={(v) => {
              setSituacao(v);
              setPagina(0);
            }}
          />
        </div>

        <div className="ax-list empty:hidden">
          {linhas.map((c) => (
            <ListRow
              key={c.codcli}
              inactive={!c.ativo}
              thumb={<Store size={22} aria-hidden />}
              title={c.nome}
              badge={
                <>
                  {!c.ativo && <Badge dot>Inativo</Badge>}
                  {c.ativo && c.bloqueado && (
                    <Badge tone="danger" icon={Ban}>
                      Bloqueado
                    </Badge>
                  )}
                </>
              }
              meta={
                <>
                  {c.nome !== c.cliente && <>{c.cliente} · </>}
                  <Dados c={c} />
                </>
              }
              actions={
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="bg-brand-soft text-brand hover:bg-brand-soft hover:text-brand hover:brightness-95"
                    onClick={() => {
                      setCondicoes(c.codcli);
                      setCondicoesAbertas(true);
                    }}
                  >
                    <Landmark />
                    Condições
                  </Button>
                  {/* Largura fixa: "1 contato" e "12 contatos" não empurram o Condições ao lado. */}
                  <Button variant="outline" size="sm" className="w-32" onClick={() => setAberto(c)}>
                    <Contact />
                    {c.contatos === 1 ? "1 contato" : `${c.contatos} contatos`}
                  </Button>
                </>
              }
            />
          ))}
          {data && linhas.length === 0 && (
            <p className="p-12 text-center text-sm text-ink-muted">
              {termo ? "Nenhum cliente bate com essa busca." : "Nenhum cliente aqui."}
            </p>
          )}
        </div>

        <Paginacao pagina={pagina} total={data?.total ?? 0} porPagina={PAGE} onMudar={setPagina} />
      </div>

      <CondicoesCliente
        codcli={condicoes}
        aberto={condicoesAbertas}
        onFechar={() => setCondicoesAbertas(false)}
      />

      <Dialog open={aberto !== null} onOpenChange={(v) => !v && setAberto(null)}>
        <DialogContent className="sm:max-w-lg">
          {aberto && <Contatos key={aberto.codcli} cliente={aberto} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Contatos do ERP só para leitura; os cadastrados aqui se editam e se excluem. */
function Contatos({ cliente }: { cliente: Cliente }) {
  const qc = useQueryClient();
  const codcli = cliente.codcli;
  // Contato cadastrado aqui em edição no formulário; null = o formulário adiciona.
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("");
  const [celular, setCelular] = useState("");

  const { data } = useQuery({
    queryKey: ["cliente-contatos", codcli],
    queryFn: () => chamar(contatosDoCliente(codcli)),
  });

  function limpar() {
    setEditandoId(null);
    setNome("");
    setTipo("");
    setCelular("");
  }

  function atualizar() {
    qc.invalidateQueries({ queryKey: ["cliente-contatos", codcli] });
    // A contagem de contatos aparece na lista.
    qc.invalidateQueries({ queryKey: ["admin-clientes"] });
  }

  const salvar = useMutation({
    mutationFn: () =>
      chamar(
        salvarContato({
          codcli,
          id: editandoId ?? undefined,
          nome,
          // O servidor confere se está na lista.
          tipo: (tipo || null) as TipoContato | null,
          celular,
        }),
      ),
    onSuccess: () => {
      toast.success(editandoId ? "Contato atualizado." : "Contato adicionado.");
      limpar();
      atualizar();
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const excluir = useMutation({
    mutationFn: (id: string) => chamar(excluirContato(id)),
    onSuccess: (_, id) => {
      toast.success("Contato excluído.");
      if (id === editandoId) limpar();
      atualizar();
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const podeSalvar = nome.trim() !== "" && numeroNacional(celular) !== null && !salvar.isPending;
  const vazio = data && data.erp.length + data.proprios.length === 0;

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>{cliente.nome}</DialogTitle>
        <DialogDescription>
          <Dados c={cliente} />. Os contatos do ERP só mudam lá; aqui você acrescenta outros e edita
          os que acrescentou.
        </DialogDescription>
      </DialogHeader>

      <div className="ax-list max-h-72 overflow-y-auto empty:hidden">
        {data?.erp.map((k) => (
          <ListRow
            key={`erp-${k.chave}`}
            title={k.nome || "Sem nome"}
            badge={<Badge>ERP</Badge>}
            meta={k.celular ? formatarTelefone(k.celular) : "Sem telefone"}
          />
        ))}
        {data?.proprios.map((k) => (
          <ListRow
            key={k.id}
            title={k.nome}
            badge={
              <Badge tone="info" dot>
                Cadastrado aqui
              </Badge>
            }
            meta={[formatarTelefone(k.celular), k.tipo].filter(Boolean).join(" · ")}
            actions={
              <>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Editar contato"
                  title="Editar contato"
                  onClick={() => {
                    setEditandoId(k.id);
                    setNome(k.nome);
                    setTipo(k.tipo ?? "");
                    setCelular(formatarTelefone(k.celular));
                  }}
                >
                  <Pencil />
                </Button>
                <Button
                  size="icon-sm"
                  variant="danger"
                  aria-label="Excluir contato"
                  title="Excluir contato"
                  disabled={excluir.isPending}
                  onClick={async () => {
                    if (await confirmar(`Excluir o contato ${k.nome}?`, "Excluir"))
                      excluir.mutate(k.id);
                  }}
                >
                  <Trash2 />
                </Button>
              </>
            }
          />
        ))}
        {vazio && <p className="p-8 text-center text-sm text-ink-muted">Nenhum contato ainda.</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (podeSalvar) salvar.mutate();
        }}
        className="space-y-3 rounded-2xl bg-surface-sunken p-4"
      >
        <p className="text-sm font-semibold text-ink">
          {editandoId ? "Editar contato" : "Novo contato"}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="contato-nome">Nome</Label>
            <Input id="contato-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contato-celular">Celular com DDD</Label>
            <Input
              id="contato-celular"
              type="tel"
              inputMode="tel"
              placeholder="(92) 99999-9999"
              value={celular}
              onChange={(e) => setCelular(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contato-tipo">Tipo (opcional)</Label>
            {/* Radix não aceita item com valor vazio: "nenhum" volta o campo para vazio. */}
            <Select value={tipo} onValueChange={(v) => setTipo(v === "nenhum" ? "" : v)}>
              <SelectTrigger id="contato-tipo">
                <SelectValue placeholder="Escolha o tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Sem tipo</SelectItem>
                {TIPOS_CONTATO.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          {editandoId && (
            <Button type="button" variant="outline" onClick={limpar}>
              Cancelar
            </Button>
          )}
          <Button type="submit" variant="accent" disabled={!podeSalvar}>
            {salvar.isPending ? "Salvando..." : editandoId ? "Salvar alterações" : "Adicionar"}
          </Button>
        </div>
      </form>
    </div>
  );
}
