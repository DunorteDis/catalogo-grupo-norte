"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  Download,
  FileText,
  Loader2,
  MessageCircle,
  Send,
  Share2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import type { PedidoDaLista } from "@/components/lista-pedidos";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatarTelefone, whatsappNumero } from "@/lib/catalogo";
import { chamar } from "@/lib/chamar";
import { copiarTexto } from "@/lib/copiar";
import { nomeArquivoCotacao, textoCotacao, totalCotacao, type DadosCotacao } from "@/lib/cotacao";
import { gerarPdfCotacao } from "@/lib/cotacao-pdf";
import { formatarReais } from "@/lib/credito";
import { cn } from "@/lib/utils";
import { codigoPedido } from "@/lib/whatsapp";
import { precosDoPedido } from "@/server/pedidos";

/** Campos do cabeçalho do pedido (ainda ilustrativos, só na tela) que entram na cotação. */
export type ExtrasCotacao = {
  /** aaaa-mm-dd, do campo de data. */
  entrega: string;
  tipoEntrega: string;
  plano: string;
  observacao: string;
};

type Formato = "texto" | "pdf";

const diaDoCampo = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return a && m && d ? `${d}/${m}/${a}` : "";
};

/** *negrito* e _itálico_ do WhatsApp na prévia, como a pessoa vai ver. */
function TextoWhatsapp({ texto }: { texto: string }) {
  return (
    <>
      {texto
        .split(/(\*[^*\n]+\*|_[^_\n]+_)/g)
        .map((p, i) =>
          p.length > 2 && p.startsWith("*") && p.endsWith("*") ? (
            <b key={i}>{p.slice(1, -1)}</b>
          ) : p.length > 2 && p.startsWith("_") && p.endsWith("_") ? (
            <i key={i}>{p.slice(1, -1)}</i>
          ) : (
            p
          ),
        )}
    </>
  );
}

function OpcaoFormato({
  ativo,
  icone: Icone,
  cor,
  titulo,
  texto,
  onClick,
}: {
  ativo: boolean;
  icone: LucideIcon;
  cor: string;
  titulo: string;
  texto: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={ativo}
      onClick={onClick}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3 text-left transition",
        ativo
          ? "border-brand bg-brand-soft"
          : "border-transparent bg-surface-sunken hover:border-line-strong",
      )}
    >
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", cor)}>
        <Icone className="size-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{titulo}</span>
        <span className="block text-xs text-ink-muted">{texto}</span>
      </span>
    </button>
  );
}

/**
 * Botão e diálogo de cotação do pedido, em texto para o WhatsApp ou em PDF. Usa os itens
 * salvos do pedido e o preço de tabela do Winthor na região do cliente, sem desconto.
 */
export function EnviarCotacao({
  pedido,
  extras,
}: {
  pedido: PedidoDaLista;
  extras: ExtrasCotacao;
}) {
  const [aberto, setAberto] = useState(false);
  const [formato, setFormato] = useState<Formato>("texto");

  const codprods = useMemo(
    () =>
      [...new Set(pedido.pedido_itens.flatMap((i) => (i.codprod != null ? [i.codprod] : [])))].sort(
        (a, b) => a - b,
      ),
    [pedido.pedido_itens],
  );
  const precos = useQuery({
    queryKey: ["pedido", pedido.id, "precos", codprods],
    queryFn: () => chamar(precosDoPedido(pedido.id, codprods)),
    enabled: aberto && !!pedido.cliente && codprods.length > 0,
  });

  const { entrega, tipoEntrega, plano, observacao } = extras;
  const dados = useMemo<DadosCotacao | null>(() => {
    if (!pedido.cliente || (codprods.length > 0 && !precos.data)) return null;
    const dia = diaDoCampo(entrega);
    return {
      codigo: codigoPedido(pedido.id),
      data: new Date().toLocaleDateString("pt-BR"),
      distribuidora: pedido.distribuidoras,
      cliente: pedido.cliente,
      vendedor: pedido.vendedores
        ? { nome: pedido.vendedores.nome, whatsapp: pedido.vendedores.whatsapp ?? null }
        : null,
      itens: pedido.pedido_itens.map((i) => {
        const p = i.codprod != null ? precos.data?.precos[i.codprod] : undefined;
        return {
          nome: i.nome,
          codprod: i.codprod,
          codigo: i.codigo,
          quantidade: i.quantidade,
          unidade: i.unidade,
          preco: p?.preco ?? null,
          porCaixa: p?.porCaixa ?? null,
        };
      }),
      // O tipo de entrega só vai junto com a data: sozinho é o valor padrão do campo.
      ...(dia ? { entrega: dia, tipoEntrega } : {}),
      ...(plano ? { plano } : {}),
      ...(observacao.trim() ? { observacao: observacao.trim() } : {}),
    };
  }, [pedido, codprods.length, precos.data, entrega, tipoEntrega, plano, observacao]);
  const texto = dados ? textoCotacao(dados) : "";

  // O PDF é gerado quando a aba dele abre, e o link temporário é solto ao fechar.
  const [pdf, setPdf] = useState<{ url: string; blob: Blob; dados: DadosCotacao } | null>(null);
  useEffect(() => {
    if (!aberto || formato !== "pdf" || !dados) return;
    let vivo = true;
    let url = "";
    gerarPdfCotacao(dados)
      .then((blob) => {
        if (!vivo) return;
        url = URL.createObjectURL(blob);
        setPdf({ url, blob, dados });
      })
      .catch(() => toast.error("Não foi possível gerar o PDF. Tente de novo."));
    return () => {
      vivo = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [aberto, formato, dados]);
  const pdfPronto = pdf && pdf.dados === dados ? pdf : null;
  const arquivo = pdfPronto
    ? new File([pdfPronto.blob], nomeArquivoCotacao(pdfPronto.dados), {
        type: "application/pdf",
      })
    : null;
  const podeCompartilhar =
    !!arquivo && typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [arquivo] });

  const destino = pedido.telefone ? whatsappNumero(pedido.telefone) : "";
  const carregando = !dados && !!pedido.cliente;

  return (
    <>
      <Button
        size="sm"
        className="bg-mint text-on-mint hover:bg-mint hover:brightness-95"
        disabled={!pedido.cliente}
        title={
          pedido.cliente
            ? "Mandar a cotação para o cliente em texto ou PDF"
            : "Identifique o cliente para cotar com os preços da tabela dele"
        }
        onClick={() => setAberto(true)}
      >
        <Send />
        Enviar cotação
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Enviar cotação #{codigoPedido(pedido.id)}</DialogTitle>
            <DialogDescription>
              Para <b className="text-ink">{pedido.cliente?.nome}</b>
              {dados && (
                <>
                  {" "}
                  · total <b className="text-ink">{formatarReais(totalCotacao(dados.itens))}</b>
                </>
              )}
              . Usa os itens salvos do pedido e o preço de tabela do Winthor, sem desconto.
            </DialogDescription>
          </DialogHeader>

          <div
            role="radiogroup"
            aria-label="Formato da cotação"
            className="grid gap-2 sm:grid-cols-2"
          >
            <OpcaoFormato
              ativo={formato === "texto"}
              icone={MessageCircle}
              cor="bg-(--wa-verde) text-white"
              titulo="Texto no WhatsApp"
              texto="Mensagem organizada, pronta para mandar na conversa."
              onClick={() => setFormato("texto")}
            />
            <OpcaoFormato
              ativo={formato === "pdf"}
              icone={FileText}
              cor="bg-danger text-white"
              titulo="PDF"
              texto="Documento na cor da distribuidora, para baixar ou compartilhar."
              onClick={() => setFormato("pdf")}
            />
          </div>

          {carregando ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Buscando os preços da tabela...
            </p>
          ) : formato === "texto" ? (
            <>
              <div className="max-h-[50vh] overflow-y-auto rounded-xl bg-(--wa-fundo) p-3 sm:p-4">
                <p className="ml-auto max-w-md whitespace-pre-wrap rounded-lg rounded-tr-sm bg-(--wa-saida) px-3 py-2 text-[0.8125rem] leading-relaxed text-(--wa-texto) shadow-sm">
                  <TextoWhatsapp texto={texto} />
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <p className="mr-auto text-xs text-ink-muted">
                  {destino
                    ? `Vai para ${formatarTelefone(pedido.telefone!)}, o celular informado no catálogo.`
                    : "O WhatsApp pergunta para quem mandar."}
                </p>
                <Button
                  variant="outline"
                  onClick={async () =>
                    (await copiarTexto(texto))
                      ? toast.success("Texto da cotação copiado.")
                      : toast.error("Não foi possível copiar. Tente de novo.")
                  }
                >
                  <Copy />
                  Copiar texto
                </Button>
                <Button
                  className="bg-(--wa-verde) text-white hover:bg-(--wa-verde) hover:brightness-95"
                  onClick={() =>
                    window.open(
                      `https://wa.me/${destino}?text=${encodeURIComponent(texto)}`,
                      "_blank",
                      "noopener",
                    )
                  }
                >
                  <MessageCircle />
                  Abrir no WhatsApp
                </Button>
              </div>
            </>
          ) : (
            <>
              {pdfPronto ? (
                <>
                  <iframe
                    // Sem a coluna de miniaturas e na largura do quadro (visualizador do Chrome e Edge).
                    src={`${pdfPronto.url}#navpanes=0&view=FitH`}
                    title="Prévia da cotação em PDF"
                    className="hidden h-[52vh] w-full rounded-xl border sm:block"
                  />
                  <p className="flex items-center gap-3 rounded-xl bg-danger-soft p-3 text-sm sm:hidden">
                    <FileText className="size-6 shrink-0 text-danger" aria-hidden />
                    {nomeArquivoCotacao(pdfPronto.dados)}
                  </p>
                </>
              ) : (
                <p className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Gerando o PDF...
                </p>
              )}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <p className="mr-auto text-xs text-ink-muted">
                  No computador, baixe e arraste para a conversa no WhatsApp Web. No celular, use
                  Compartilhar e escolha o WhatsApp.
                </p>
                <Button
                  variant="outline"
                  disabled={!pdfPronto}
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = pdfPronto!.url;
                    a.download = nomeArquivoCotacao(pdfPronto!.dados);
                    a.click();
                  }}
                >
                  <Download />
                  Baixar PDF
                </Button>
                {podeCompartilhar && (
                  <Button
                    className="bg-danger text-white hover:bg-danger hover:brightness-95"
                    onClick={() =>
                      navigator
                        .share({ files: [arquivo!], title: `Cotação #${codigoPedido(pedido.id)}` })
                        .catch(() => {})
                    }
                  >
                    <Share2 />
                    Compartilhar
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
