"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDown,
  Check,
  FileText,
  ImageIcon,
  Loader2,
  Mic,
  Reply,
  SendHorizontal,
  Sticker,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { chamar } from "@/lib/chamar";
import { mensagemErro } from "@/lib/erros";
import { cn } from "@/lib/utils";
import { resumoMensagem, type TipoMensagem } from "@/lib/whatsapp";
import {
  enviarMensagem,
  marcarLida,
  mensagensDaConversa,
  type MensagemDaConversa,
} from "@/server/conversas";

const TIPO: Partial<Record<TipoMensagem, [LucideIcon, string]>> = {
  imagem: [ImageIcon, "Foto"],
  audio: [Mic, "Áudio"],
  video: [Video, "Vídeo"],
  documento: [FileText, "Documento"],
  figurinha: [Sticker, "Figurinha"],
  outro: [FileText, "Mensagem"],
};

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const diaDe = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

function rotuloDia(iso: string) {
  const d = diaDe(iso);
  const hoje = new Date();
  if (d === hoje.toLocaleDateString("pt-BR")) return "Hoje";
  hoje.setDate(hoje.getDate() - 1);
  return d === hoje.toLocaleDateString("pt-BR") ? "Ontem" : d;
}

/**
 * Histórico de uma conversa do WhatsApp com a cara do WhatsApp: fundo bege, balão branco
 * para quem escreve e verde para o vendedor, separador de dias. Busca as novas a cada 5 s
 * e as antigas de 50 em 50. `podeResponder` mostra a caixa de digitar (só o dono).
 */
export function HistoricoConversa({
  conversaId,
  podeResponder = false,
  contato,
  className,
}: {
  conversaId: string;
  podeResponder?: boolean;
  /** Nome de quem conversa com o vendedor, para o trecho citado nas respostas. */
  contato?: string;
  className?: string;
}) {
  const qc = useQueryClient();
  const [respondendo, setRespondendo] = useState<MensagemDaConversa | null>(null);
  const autor = (deMim: boolean) =>
    deMim ? (podeResponder ? "Você" : "Vendedor") : (contato ?? "Contato");
  const consulta = useInfiniteQuery({
    queryKey: ["mensagens", conversaId],
    queryFn: ({ pageParam }) => chamar(mensagensDaConversa(conversaId, pageParam)),
    initialPageParam: null as string | null,
    getNextPageParam: (pagina) => pagina.antes,
    refetchInterval: 5000,
  });
  // A primeira página é a mais nova; cada página vem em ordem de horário.
  const mensagens = [...(consulta.data?.pages ?? [])].reverse().flatMap((p) => p.mensagens);
  const primeiraId = mensagens[0]?.id;
  const ultima = mensagens.at(-1);

  // Desce sozinho na primeira carga e quando chega mensagem (se já estava no fim); ao
  // carregar as antigas em cima, mantém na tela o que estava.
  const caixa = useRef<HTMLDivElement>(null);
  const antes = useRef<{
    primeira?: number | undefined;
    ultima?: number | undefined;
    doFim: number;
  }>({ doFim: 0 });
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el || !ultima) return;
    const a = antes.current;
    if (a.ultima !== ultima.id) {
      if (a.ultima === undefined || a.doFim < 160 || ultima.deMim) el.scrollTop = el.scrollHeight;
    } else if (a.primeira !== primeiraId) {
      el.scrollTop = el.scrollHeight - a.doFim - el.clientHeight;
    }
    antes.current = {
      primeira: primeiraId,
      ultima: ultima.id,
      doFim: el.scrollHeight - el.scrollTop - el.clientHeight,
    };
  }, [primeiraId, ultima]);

  // Aberta pelo dono, a conversa deixa de contar como não lida.
  const ultimaRecebida = ultima && !ultima.deMim ? ultima.id : undefined;
  useEffect(() => {
    if (!podeResponder || ultimaRecebida === undefined) return;
    chamar(marcarLida(conversaId))
      .then(() => qc.invalidateQueries({ queryKey: ["conversas"] }))
      .catch(() => {});
  }, [podeResponder, conversaId, ultimaRecebida, qc]);

  return (
    <div className={cn("flex min-h-0 flex-col bg-(--wa-fundo)", className)}>
      <div
        ref={caixa}
        onScroll={(e) => {
          const el = e.currentTarget;
          antes.current.doFim = el.scrollHeight - el.scrollTop - el.clientHeight;
        }}
        className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(var(--wa-linha)_1px,transparent_1px)] [background-size:18px_18px] px-[6%] py-3"
      >
        {consulta.hasNextPage && (
          <div className="mb-2 flex justify-center">
            <button
              type="button"
              onClick={() => consulta.fetchNextPage()}
              disabled={consulta.isFetchingNextPage}
              className="cursor-pointer rounded-full bg-(--wa-entrada) px-3 py-1 text-xs text-(--wa-hora) shadow-sm hover:brightness-95"
            >
              {consulta.isFetchingNextPage ? "Carregando..." : "Carregar mensagens anteriores"}
            </button>
          </div>
        )}

        {consulta.isPending && (
          <p className="flex justify-center py-10 text-(--wa-hora)">
            <Loader2 className="size-5 animate-spin" aria-label="Carregando" />
          </p>
        )}
        {consulta.error && (
          <p className="mx-auto max-w-sm rounded-lg bg-(--wa-entrada) p-3 text-center text-sm text-danger">
            {mensagemErro(consulta.error)}
          </p>
        )}
        {consulta.data && mensagens.length === 0 && (
          <p className="mx-auto mt-6 w-fit rounded-lg bg-(--wa-entrada) px-3 py-1.5 text-xs text-(--wa-hora) shadow-sm">
            Nenhuma mensagem ainda.
          </p>
        )}

        {mensagens.map((m, i) => {
          const anterior = mensagens[i - 1];
          const novoDia = !anterior || diaDe(anterior.enviadaEm) !== diaDe(m.enviadaEm);
          // Balões seguidos do mesmo lado: só o primeiro tem a "pontinha".
          const seguida = !novoDia && anterior?.deMim === m.deMim;
          const responder = podeResponder && (
            <button
              type="button"
              onClick={() => setRespondendo(m)}
              aria-label="Responder"
              title="Responder"
              className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full bg-(--wa-entrada) text-(--wa-hora) opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:pointer-events-none [@media(hover:none)]:group-focus-within:pointer-events-auto [@media(hover:none)]:group-focus-within:opacity-100"
            >
              <Reply className="size-4" />
            </button>
          );
          return (
            <Fragment key={m.id}>
              {novoDia && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-lg bg-(--wa-entrada) px-3 py-1 text-[0.7813rem] text-(--wa-hora) shadow-sm">
                    {rotuloDia(m.enviadaEm)}
                  </span>
                </div>
              )}
              <div
                className={cn(
                  "group flex items-center gap-1.5",
                  m.deMim ? "justify-end" : "justify-start",
                  seguida ? "mt-0.5" : "mt-2",
                )}
              >
                {m.deMim && responder}
                <div
                  // No toque não há hover: tocar no balão o foca e mostra o Responder só dele.
                  tabIndex={podeResponder ? -1 : undefined}
                  className={cn(
                    "relative max-w-[78%] rounded-lg px-2.5 pb-1.5 pt-1.5 text-[0.875rem] leading-4.75 text-(--wa-texto) shadow-sm outline-none",
                    m.deMim ? "bg-(--wa-saida)" : "bg-(--wa-entrada)",
                    !seguida && (m.deMim ? "rounded-tr-none" : "rounded-tl-none"),
                  )}
                >
                  {!seguida && (
                    <svg
                      viewBox="0 0 8 13"
                      aria-hidden
                      className={cn(
                        "absolute top-0 h-3.25 w-2",
                        m.deMim ? "-right-2 text-(--wa-saida)" : "-left-2 text-(--wa-entrada)",
                      )}
                    >
                      <path
                        fill="currentColor"
                        d={
                          m.deMim
                            ? "M5.188 1H0v11.193l6.467-8.625C7.526 2.156 6.958 1 5.188 1z"
                            : "M1.533 3.568 8 12.193V1H2.812C1.042 1 .474 2.156 1.533 3.568z"
                        }
                      />
                    </svg>
                  )}
                  {m.citada && <Citacao citada={m.citada} autor={autor(m.citada.deMim)} />}
                  <Midia m={m} />
                  {/* Documento sem legenda: o texto é o nome do arquivo, que já aparece acima. */}
                  {m.texto && m.texto !== m.nomeArquivo && (
                    <span className="whitespace-pre-wrap wrap-break-word">{m.texto}</span>
                  )}
                  <span className="float-right ml-3 mt-1.5 flex translate-y-1 items-center gap-0.5 text-[0.6875rem] leading-none text-(--wa-hora)">
                    {hora(m.enviadaEm)}
                    {m.deMim && <Check className="size-3.5" aria-label="Enviada" />}
                  </span>
                </div>
                {!m.deMim && responder}
              </div>
            </Fragment>
          );
        })}
      </div>

      {podeResponder && (
        <CaixaDeTexto
          conversaId={conversaId}
          respondendo={respondendo}
          autor={respondendo ? autor(respondendo.deMim) : ""}
          onCancelarResposta={() => setRespondendo(null)}
        />
      )}
    </div>
  );
}

/** Trecho da mensagem respondida, em cima do balão e da caixa de texto, como no WhatsApp. */
function Citacao({
  citada,
  autor,
  className,
}: {
  citada: Pick<MensagemDaConversa, "deMim" | "tipo" | "texto">;
  autor: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-1 min-w-0 rounded-md border-l-4 bg-(--wa-texto)/5 px-2 py-1 text-[0.8125rem] leading-4.5",
        citada.deMim ? "border-(--wa-verde)" : "border-(--wa-lido)",
        className,
      )}
    >
      <p className={cn("font-medium", citada.deMim ? "text-(--wa-verde)" : "text-(--wa-lido)")}>
        {autor}
      </p>
      <p className="line-clamp-2 text-(--wa-hora)">{resumoMensagem(citada)}</p>
    </div>
  );
}

/** Cores do ícone do documento pela extensão, como o WhatsApp: PDF vermelho, Word azul... */
const CORES_ARQUIVO: [RegExp, string, string][] = [
  [/^pdf$/, "bg-danger-soft", "bg-danger"],
  [/^(docx?|odt|rtf)$/, "bg-info-soft", "bg-info"],
  [/^(xlsx?|xlsm|csv|ods)$/, "bg-success-soft", "bg-success"],
  [/^(pptx?|odp)$/, "bg-warning-soft", "bg-warning"],
];

function IconeArquivo({ extensao }: { extensao: string }) {
  const [, fundo, faixa] = CORES_ARQUIVO.find(([re]) => re.test(extensao)) ?? [
    null,
    "bg-surface-sunken",
    "bg-ink-subtle",
  ];
  return (
    // Folha com o canto dobrado e a faixa com a extensão.
    <span
      aria-hidden
      className={cn("relative h-10 w-8 shrink-0 rounded-xs rounded-tr-[0.5625rem]", fundo)}
    >
      {extensao && (
        <span
          className={cn(
            "absolute inset-x-0.5 bottom-1.5 truncate rounded-xs text-center text-[0.5rem] font-bold uppercase leading-2.75 text-surface",
            faixa,
          )}
        >
          {extensao.slice(0, 4)}
        </span>
      )}
    </span>
  );
}

const tamanho = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} kB`
    : `${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;

/**
 * Foto, áudio, vídeo, documento ou figurinha, de /midias/<id> (que baixa da W-API se
 * ainda não baixou). Se o arquivo não vier, fica o rótulo e o aviso de ver no celular.
 */
function Midia({ m }: { m: MensagemDaConversa }) {
  const [falhou, setFalhou] = useState(false);
  const rotulo = m.tipo === "texto" ? undefined : TIPO[m.tipo];
  if (!rotulo) return null;
  const src = `/midias/${m.id}`;
  const erro = () => setFalhou(true);
  const [Icone, nome] = rotulo;

  if (falhou || m.tipo === "outro")
    return (
      <span className="mb-0.5 flex items-center gap-1.5 text-(--wa-hora)">
        <Icone className="size-4 shrink-0" aria-hidden />
        {nome}
        {falhou && " · não carregou, veja no celular"}
      </span>
    );
  if (m.tipo === "imagem")
    return (
      <a href={src} target="_blank" rel="noreferrer" className="-mx-1 mb-1 block">
        <img
          src={src}
          alt="Foto"
          loading="lazy"
          onError={erro}
          className="max-h-80 w-72 max-w-full rounded-md bg-(--wa-painel) object-cover"
        />
      </a>
    );
  if (m.tipo === "figurinha")
    return <img src={src} alt="Figurinha" loading="lazy" onError={erro} className="size-32" />;
  if (m.tipo === "video")
    return (
      <video
        src={src}
        controls
        preload="metadata"
        onError={erro}
        className="-mx-1 mb-1 max-h-80 w-72 max-w-full rounded-md bg-(--wa-painel)"
      />
    );
  if (m.tipo === "audio") return <PlayerAudio src={src} onErro={erro} />;
  return <Documento m={m} />;
}

const VELOCIDADES = [1, 1.5, 2];
// Como no WhatsApp: a última velocidade escolhida vale para os próximos áudios.
let ultimaVelocidade = 1;

/** Player do navegador com o botão de velocidade do WhatsApp (1×, 1,5×, 2×). */
function PlayerAudio({ src, onErro }: { src: string; onErro: () => void }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [velocidade, setVelocidade] = useState(ultimaVelocidade);
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    // defaultPlaybackRate também: alguns navegadores voltam para ela ao carregar (no 1º play).
    a.defaultPlaybackRate = velocidade;
    a.playbackRate = velocidade;
  }, [velocidade]);

  return (
    <span className="flex items-center gap-2">
      <audio
        ref={ref}
        src={src}
        controls
        preload="none"
        onError={onErro}
        className="h-10 w-64 max-w-full"
      />
      <button
        type="button"
        onClick={() => {
          const proxima = VELOCIDADES[(VELOCIDADES.indexOf(velocidade) + 1) % VELOCIDADES.length]!;
          ultimaVelocidade = proxima;
          setVelocidade(proxima);
        }}
        title="Velocidade"
        aria-label={`Velocidade ${velocidade}×; clique para trocar`}
        className="h-6 min-w-11 shrink-0 cursor-pointer rounded-full bg-(--wa-hora) px-2 text-xs font-bold text-(--wa-entrada) hover:brightness-110"
      >
        {velocidade.toLocaleString("pt-BR")}×
      </button>
    </span>
  );
}

/** Lê o download aos poucos, avisando o progresso (null quando o tamanho é desconhecido). */
async function baixarComProgresso(
  url: string,
  tamanhoEsperado: number | null,
  signal: AbortSignal,
  onProgresso: (p: number | null) => void,
) {
  const r = await fetch(url, { signal });
  if (!r.ok || !r.body) throw new Error(`O download respondeu ${r.status}`);
  const total = Number(r.headers.get("content-length")) || tamanhoEsperado || 0;
  const leitor = r.body.getReader();
  const partes: Uint8Array[] = [];
  let recebido = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    partes.push(value);
    recebido += value.length;
    onProgresso(total ? Math.min(1, recebido / total) : null);
  }
  return new Blob(partes as BlobPart[], { type: r.headers.get("content-type") ?? "" });
}

type Baixa =
  | { fase: "parado" }
  | { fase: "baixando"; progresso: number | null; parar: AbortController }
  | { fase: "baixado"; url: string };

const RAIO = 14;
const VOLTA = 2 * Math.PI * RAIO;

/**
 * Documento como no WhatsApp: o primeiro clique baixa (o anel enche com o progresso e o
 * arquivo é salvo com o nome original; clicar de novo cancela). Baixado, o clique abre.
 */
function Documento({ m }: { m: MensagemDaConversa }) {
  const [baixa, setBaixa] = useState<Baixa>({ fase: "parado" });
  const nome = m.nomeArquivo ?? m.texto ?? "Documento";
  // O arquivo baixado fica na memória enquanto o balão estiver na tela.
  useEffect(
    () => () => {
      if (baixa.fase === "baixado") URL.revokeObjectURL(baixa.url);
    },
    [baixa],
  );

  async function clicar() {
    if (baixa.fase === "baixado") {
      window.open(baixa.url, "_blank", "noopener");
      return;
    }
    if (baixa.fase === "baixando") {
      baixa.parar.abort();
      setBaixa({ fase: "parado" });
      return;
    }
    const parar = new AbortController();
    setBaixa({ fase: "baixando", progresso: 0, parar });
    try {
      const [arquivo] = await Promise.all([
        baixarComProgresso(`/midias/${m.id}?baixar`, m.tamanhoArquivo, parar.signal, (p) =>
          setBaixa((b) => (b.fase === "baixando" ? { ...b, progresso: p } : b)),
        ),
        // Arquivo pequeno chega num piscar: o anel ainda aparece completando.
        new Promise((pronto) => setTimeout(pronto, 500)),
      ]);
      const url = URL.createObjectURL(arquivo);
      const salvar = document.createElement("a");
      salvar.href = url;
      salvar.download = nome;
      salvar.click();
      setBaixa({ fase: "baixado", url });
    } catch {
      if (parar.signal.aborted) return;
      setBaixa({ fase: "parado" });
      toast.error("Não foi possível baixar o documento. Tente de novo.");
    }
  }

  const extensao = m.nomeArquivo?.match(/\.([a-z0-9]{1,5})$/i)?.[1]?.toLowerCase() ?? "";
  // "1 página · PDF · 43 kB", na ordem do WhatsApp.
  const detalhes = [
    m.paginas && `${m.paginas} ${m.paginas === 1 ? "página" : "páginas"}`,
    extensao.toUpperCase(),
    m.tamanhoArquivo && tamanho(m.tamanhoArquivo),
  ]
    .filter(Boolean)
    .join(" · ");
  const acao = { parado: "Baixar", baixando: "Cancelar download", baixado: "Abrir" }[baixa.fase];

  return (
    <button
      type="button"
      onClick={clicar}
      title={acao}
      aria-label={`${acao}: ${nome}`}
      className="mb-1 flex w-72 max-w-full cursor-pointer items-center gap-3 rounded-md bg-(--wa-texto)/5 p-2.5 text-left hover:bg-(--wa-texto)/10"
    >
      <IconeArquivo extensao={extensao} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{nome}</span>
        {detalhes && <span className="block text-xs text-(--wa-hora)">{detalhes}</span>}
      </span>
      {baixa.fase === "parado" && (
        <span className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-(--wa-hora)/50 text-(--wa-hora)">
          <ArrowDown className="size-4" aria-hidden />
        </span>
      )}
      {baixa.fase === "baixando" && (
        <span className="relative grid size-8 shrink-0 place-items-center text-(--wa-hora)">
          <svg
            viewBox="0 0 32 32"
            aria-hidden
            className={cn(
              "absolute inset-0 -rotate-90",
              baixa.progresso === null && "animate-spin",
            )}
          >
            <circle
              cx="16"
              cy="16"
              r={RAIO}
              fill="none"
              strokeWidth="2.5"
              className="stroke-(--wa-linha)"
            />
            <circle
              cx="16"
              cy="16"
              r={RAIO}
              fill="none"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={VOLTA}
              strokeDashoffset={VOLTA * (1 - (baixa.progresso ?? 0.25))}
              className="stroke-(--wa-verde) transition-[stroke-dashoffset] duration-200"
            />
          </svg>
          <X className="size-3.5" aria-hidden />
        </span>
      )}
    </button>
  );
}

function CaixaDeTexto({
  conversaId,
  respondendo,
  autor,
  onCancelarResposta,
}: {
  conversaId: string;
  respondendo: MensagemDaConversa | null;
  autor: string;
  onCancelarResposta: () => void;
}) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const campo = useRef<HTMLTextAreaElement>(null);
  // Escolheu responder: o cursor já vai para a caixa.
  useEffect(() => {
    if (respondendo) campo.current?.focus();
  }, [respondendo]);
  const enviar = useMutation({
    mutationFn: (t: string) => chamar(enviarMensagem(conversaId, t, respondendo?.id ?? null)),
    onSuccess: () => {
      setTexto("");
      onCancelarResposta();
      qc.invalidateQueries({ queryKey: ["mensagens", conversaId] });
      qc.invalidateQueries({ queryKey: ["conversas"] });
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });
  const mandar = () => {
    if (texto.trim() && !enviar.isPending) enviar.mutate(texto);
  };

  return (
    <div className="bg-(--wa-painel)">
      {respondendo && (
        <div className="flex items-center gap-2 px-3 pt-2">
          <Citacao citada={respondendo} autor={autor} className="mb-0 flex-1" />
          <button
            type="button"
            onClick={onCancelarResposta}
            aria-label="Cancelar resposta"
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-(--wa-hora) hover:bg-(--wa-texto)/5"
          >
            <X className="size-5" />
          </button>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mandar();
        }}
        className="flex items-end gap-2 px-3 py-2"
      >
        <textarea
          ref={campo}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            // Enter envia, Shift+Enter quebra a linha, como no WhatsApp Web; Esc larga a resposta.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              mandar();
            } else if (e.key === "Escape" && respondendo) {
              onCancelarResposta();
            }
          }}
          rows={1}
          placeholder="Digite uma mensagem"
          aria-label="Mensagem"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-lg bg-(--wa-entrada) px-3 py-2.5 text-[0.875rem] text-(--wa-texto) outline-none placeholder:text-(--wa-hora) field-sizing-content"
        />
        <button
          type="submit"
          disabled={!texto.trim() || enviar.isPending}
          aria-label="Enviar"
          className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full bg-(--wa-verde) text-primary-foreground transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {enviar.isPending ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <SendHorizontal className="size-5" />
          )}
        </button>
      </form>
    </div>
  );
}
