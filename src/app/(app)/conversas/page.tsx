"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  Landmark,
  MessageCircle,
  Search,
  UserRoundPen,
  UserRoundSearch,
  UserRoundX,
} from "lucide-react";
import { toast } from "sonner";

import { Badge, SearchInput } from "@/components/abastex";
import { BuscaDeCliente } from "@/components/busca-de-cliente";
import { CondicoesCliente } from "@/components/condicoes-cliente";
import { BotaoConexao } from "@/components/whatsapp/conexao";
import { HistoricoConversa } from "@/components/whatsapp/historico";
import { useConversas } from "@/hooks/use-conversas";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { iniciais } from "@/lib/acessos";
import { formatarDocumento, formatarTelefone, slugify } from "@/lib/catalogo";
import { chamar } from "@/lib/chamar";
import { confirmar } from "@/lib/confirmar";
import { mensagemErro } from "@/lib/erros";
import { cn } from "@/lib/utils";
import { identificarCliente, minhasConversas, type ConversaDaLista } from "@/server/conversas";

/** "14:32" hoje, "Ontem", "12/09/26" antes disso — como na lista do WhatsApp. */
function quando(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString())
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  hoje.setDate(hoje.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** Contato que só veio pelo LID (o vendedor escreveu primeiro) ainda não tem número. */
const fone = (telefone: string) =>
  telefone.endsWith("@lid") ? "Número ainda não informado" : formatarTelefone(telefone);

const titulo = (c: ConversaDaLista) => c.cliente ?? c.nome_contato ?? fone(c.telefone);

/** Foto de perfil do WhatsApp do contato; sem foto (ou se não carregar), as iniciais. */
function Avatar({ conversa, className }: { conversa: ConversaDaLista; className: string }) {
  const [semFoto, setSemFoto] = useState(false);
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full font-bold uppercase",
        conversa.codcli ? "bg-mint-soft text-mint-ink" : "bg-surface-sunken text-ink-muted",
        className,
      )}
      aria-hidden
    >
      {iniciais(titulo(conversa))}
      {!semFoto && (
        <img
          src={`/midias/contato/${conversa.id}`}
          alt=""
          loading="lazy"
          onError={() => setSemFoto(true)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </span>
  );
}

/** Conversas do WhatsApp do vendedor, no formato do WhatsApp Web: lista à esquerda, conversa à direita. */
/** Fora do piloto a página não abre nem consulta nada: o módulo está em desenvolvimento. */
export default function ConversasPage() {
  if (!useConversas())
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <MessageCircle className="size-12 text-ink-subtle" aria-hidden />
        <h1 className="text-xl font-semibold">Conversas em desenvolvimento</h1>
        <p className="max-w-sm text-sm text-ink-muted">
          Em breve você atende os clientes pelo WhatsApp por aqui. Os links do catálogo, os pedidos
          e a carteira continuam funcionando normalmente.
        </p>
      </div>
    );
  return <Conversas />;
}

function Conversas() {
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [condicoes, setCondicoes] = useState(false);
  const [identificando, setIdentificando] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["conversas"],
    queryFn: () => chamar(minhasConversas()),
    refetchInterval: 5000,
  });
  const conversas = data ?? [];
  const aberta = conversas.find((c) => c.id === abertaId) ?? null;

  const palavras = slugify(busca).split("-").filter(Boolean);
  const filtradas = conversas.filter((c) =>
    palavras.every((p) =>
      `${slugify(titulo(c))}-${c.telefone}-${slugify(c.ultima_mensagem ?? "")}`.includes(p),
    ),
  );

  return (
    // No celular ocupa a tela toda abaixo da barra (3.5rem), como o WhatsApp; a partir
    // de 640px vira o painel com moldura. A altura desconta a barra (3.5rem; 4rem a partir
    // de 768px), o espaço de cima da área (1.25rem; 1.5rem a partir de 1024px) e 1rem embaixo.
    <div className="-mx-4 -mb-10 -mt-5 flex h-[calc(100dvh-3.5rem)] min-h-112 overflow-hidden bg-card sm:mx-0 sm:-mb-6 sm:mt-0 sm:h-[calc(100dvh-5.75rem)] sm:rounded-2xl sm:border sm:shadow-card md:h-[calc(100dvh-6.25rem)] lg:h-[calc(100dvh-6.5rem)]">
      <aside
        className={cn(
          "w-full shrink-0 flex-col border-r md:flex md:w-90",
          aberta ? "hidden" : "flex",
        )}
      >
        <header className="flex h-16 items-center gap-2 bg-(--wa-painel) px-4">
          <MessageCircle className="size-5 text-(--wa-verde)" aria-hidden />
          <h1 className="flex-1 text-lg font-bold text-(--wa-texto)">Conversas</h1>
          <BotaoConexao />
        </header>
        <div className="border-b px-3 py-2">
          <label className="flex h-9 items-center gap-2 rounded-lg bg-(--wa-painel) px-3 text-(--wa-hora)">
            <Search className="size-4 shrink-0" aria-hidden />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Pesquisar conversa ou cliente"
              className="w-full bg-transparent text-sm text-(--wa-texto) outline-none placeholder:text-(--wa-hora)"
            />
          </label>
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto">
          {isLoading && <li className="p-6 text-center text-sm text-ink-muted">Carregando...</li>}
          {error && (
            <li className="m-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">
              {mensagemErro(error)}
            </li>
          )}
          {data && filtradas.length === 0 && (
            <li className="p-6 text-center text-sm text-ink-muted">
              {busca
                ? "Nenhuma conversa encontrada."
                : "Nenhuma conversa ainda. As mensagens do seu WhatsApp aparecem aqui."}
            </li>
          )}
          {filtradas.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setAbertaId(c.id)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 px-3 text-left transition-colors hover:bg-(--wa-painel)",
                  c.id === abertaId && "bg-(--wa-painel)",
                )}
              >
                <Avatar conversa={c} className="size-12 text-sm" />
                <div className="min-w-0 flex-1 border-b border-(--wa-linha) py-3">
                  <div className="flex items-baseline gap-2">
                    <p className="min-w-0 flex-1 truncate font-medium text-(--wa-texto)">
                      {titulo(c)}
                    </p>
                    <span
                      className={cn(
                        "shrink-0 text-xs",
                        c.nao_lidas > 0 ? "font-semibold text-(--wa-verde)" : "text-(--wa-hora)",
                      )}
                    >
                      {quando(c.ultima_em)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="flex min-w-0 flex-1 items-center gap-1 truncate text-sm text-(--wa-hora)">
                      {c.ultima_de_mim && (
                        <Check className="size-4 shrink-0" aria-label="Enviada" />
                      )}
                      <span className="truncate">{c.ultima_mensagem}</span>
                    </p>
                    {!c.codcli && (
                      <span className="shrink-0 rounded-full bg-warning-soft px-2 text-[0.6875rem] font-semibold text-warning">
                        sem cliente
                      </span>
                    )}
                    {c.nao_lidas > 0 && (
                      <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-(--wa-verde) px-1.5 text-[0.6875rem] font-bold text-primary-foreground">
                        {c.nao_lidas}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className={cn("min-w-0 flex-1 flex-col md:flex", aberta ? "flex" : "hidden")}>
        {aberta ? (
          <>
            <header className="flex h-16 shrink-0 items-center gap-3 border-b border-(--wa-linha) bg-(--wa-painel) px-3">
              <Button
                size="icon-sm"
                variant="ghost"
                className="md:hidden"
                aria-label="Voltar para as conversas"
                onClick={() => setAbertaId(null)}
              >
                <ArrowLeft />
              </Button>
              <Avatar conversa={aberta} className="size-10 text-xs" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-(--wa-texto)">{titulo(aberta)}</p>
                <p className="truncate text-xs text-(--wa-hora)">
                  {fone(aberta.telefone)}
                  {aberta.nome_contato && aberta.cliente && ` · ${aberta.nome_contato}`}
                  {aberta.codcli ? ` · cód. ${aberta.codcli}` : " · cliente não identificado"}
                </p>
              </div>
              {aberta.codcli ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Trocar o cliente desta conversa"
                    onClick={() => setIdentificando(true)}
                  >
                    <UserRoundPen />
                    <span className="hidden lg:inline">Trocar cliente</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="bg-brand-soft text-brand hover:bg-brand-soft hover:text-brand hover:brightness-95"
                    onClick={() => setCondicoes(true)}
                  >
                    <Landmark />
                    <span className="hidden sm:inline">Condições</span>
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="bg-warning-soft text-warning hover:bg-warning-soft hover:text-warning hover:brightness-95"
                  onClick={() => setIdentificando(true)}
                >
                  <UserRoundSearch />
                  <span className="hidden sm:inline">Identificar cliente</span>
                </Button>
              )}
            </header>
            <HistoricoConversa
              key={aberta.id}
              conversaId={aberta.id}
              podeResponder
              contato={titulo(aberta)}
              codcli={aberta.codcli}
              className="flex-1"
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-(--wa-painel) p-8 text-center">
            <MessageCircle className="size-14 text-(--wa-verde)" aria-hidden />
            <p className="text-xl font-light text-(--wa-texto)">Conversas do seu WhatsApp</p>
            <p className="max-w-sm text-sm text-(--wa-hora)">
              Escolha uma conversa à esquerda. Quem é cliente aparece com o nome do Winthor; quem
              não é, você identifica uma vez e o número fica guardado.
            </p>
          </div>
        )}
      </section>

      <CondicoesCliente
        codcli={aberta?.codcli ?? null}
        comLink
        aberto={condicoes}
        onFechar={() => setCondicoes(false)}
      />
      {aberta && (
        <IdentificarCliente
          conversa={aberta}
          aberto={identificando}
          onFechar={() => setIdentificando(false)}
        />
      )}
    </div>
  );
}

/** Escolhe o cliente da conversa (qualquer cliente ativo do Winthor); o número fica nos contatos dele. */
function IdentificarCliente({
  conversa,
  aberto,
  onFechar,
}: {
  conversa: ConversaDaLista;
  aberto: boolean;
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  // Com cliente, o diálogo troca ou remove; sem, identifica.
  const trocando = conversa.codcli !== null;
  const escolher = useMutation({
    mutationFn: (codcli: number | null) => chamar(identificarCliente(conversa.id, codcli)),
    onSuccess: (_, codcli) => {
      toast.success(
        codcli === null
          ? "Cliente removido da conversa."
          : "Cliente identificado. Da próxima vez esse número já chega com o nome.",
      );
      qc.invalidateQueries({ queryKey: ["conversas"] });
      onFechar();
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {trocando ? "Trocar o cliente da conversa" : "De que cliente é essa conversa?"}
          </DialogTitle>
          <DialogDescription>
            {fone(conversa.telefone)}
            {conversa.nome_contato && ` · ${conversa.nome_contato}`}.{" "}
            {trocando && (
              <>
                Hoje está com{" "}
                <b className="text-ink">
                  {conversa.cliente ?? "cliente"} (cód. {conversa.codcli})
                </b>
                .{" "}
              </>
            )}
            Busque o cliente pelo nome, código ou CNPJ; os da sua carteira aparecem primeiro.
          </DialogDescription>
        </DialogHeader>
        <BuscaDeCliente
          ativo={aberto}
          desabilitado={escolher.isPending}
          onEscolher={(c) => escolher.mutate(c.codcli)}
        />
        {trocando && (
          <div className="flex justify-end border-t pt-3">
            <Button
              variant="danger"
              size="sm"
              disabled={escolher.isPending}
              onClick={async () => {
                if (
                  await confirmar(
                    `Tirar ${conversa.cliente ?? "o cliente"} desta conversa? O número também sai dos contatos dele no CRM.`,
                    "Remover",
                  )
                )
                  escolher.mutate(null);
              }}
            >
              <UserRoundX />
              Remover cliente desta conversa
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
