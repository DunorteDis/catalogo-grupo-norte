"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleCheck, RefreshCw, Smartphone, TriangleAlert, Unplug } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatarTelefone } from "@/lib/catalogo";
import { chamar } from "@/lib/chamar";
import { confirmar } from "@/lib/confirmar";
import { mensagemErro } from "@/lib/erros";
import { cn } from "@/lib/utils";
import {
  avisoWhatsapp,
  conectarWhatsapp,
  desconectarWhatsapp,
  estadoWhatsapp,
  qrCodeWhatsapp,
} from "@/server/conexao-whatsapp";

const CHAVE = "whatsapp-conexao";

/**
 * Conexão do número com o CRM. `vendedorId` null é o próprio vendedor (lê o QR code e
 * desconecta); com id é o admin, que também cadastra a instância da W-API.
 */
export function ConexaoWhatsapp({ vendedorId }: { vendedorId: string | null }) {
  const qc = useQueryClient();
  const admin = vendedorId !== null;
  const [editando, setEditando] = useState(false);
  const [instancia, setInstancia] = useState("");
  const [token, setToken] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  const estado = useQuery({
    queryKey: [CHAVE, vendedorId ?? "eu", "estado"],
    queryFn: () => chamar(estadoWhatsapp(vendedorId)),
    // Esperando o celular ler o código, confere a cada 3 s; conectado, de vez em quando.
    refetchInterval: (q) => (q.state.data?.cadastrado && q.state.data.conectado ? 30_000 : 3_000),
  });
  const recarregar = () => qc.invalidateQueries({ queryKey: [CHAVE] });

  const conectar = useMutation({
    mutationFn: () => chamar(conectarWhatsapp(vendedorId!, { instancia, token })),
    onSuccess: (r) => {
      setAviso(r.aviso);
      setEditando(false);
      setToken("");
      toast.success("Instância salva.");
      recarregar();
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const desconectar = useMutation({
    mutationFn: () => chamar(desconectarWhatsapp(vendedorId)),
    onSuccess: () => {
      toast.success("WhatsApp desconectado do CRM.");
      recarregar();
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const e = estado.data;
  if (estado.isLoading)
    return <p className="py-8 text-center text-sm text-ink-muted">Carregando...</p>;
  if (estado.error)
    return (
      <p className="rounded-xl bg-danger-soft p-3 text-sm text-danger">
        {mensagemErro(estado.error)}
      </p>
    );

  return (
    <div className="grid gap-4">
      {aviso && (
        <p className="flex gap-2 rounded-xl bg-warning-soft p-3 text-sm text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {aviso}
        </p>
      )}

      {admin && (editando || !e?.cadastrado) ? (
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            conectar.mutate();
          }}
          className="grid gap-3"
        >
          <p className="text-sm text-ink-muted">
            Crie a instância no painel da W-API e cole aqui o ID e o token dela. O CRM passa a
            receber as mensagens desse número sozinho.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="wa-instancia" className="text-xs text-muted-foreground">
              ID da instância
            </Label>
            <Input
              id="wa-instancia"
              value={instancia}
              onChange={(ev) => setInstancia(ev.target.value)}
              required
              autoComplete="off"
              placeholder="T34398-VYR3QD-MS29SL"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wa-token" className="text-xs text-muted-foreground">
              Token da instância
            </Label>
            <Input
              id="wa-token"
              type="password"
              value={token}
              onChange={(ev) => setToken(ev.target.value)}
              required
              autoComplete="off"
              className="font-mono"
            />
          </div>
          <div className="flex justify-end gap-2">
            {e?.cadastrado && (
              <Button type="button" variant="outline" onClick={() => setEditando(false)}>
                Cancelar
              </Button>
            )}
            <Button type="submit" variant="accent" disabled={conectar.isPending}>
              {conectar.isPending ? "Conferindo..." : "Salvar e conectar"}
            </Button>
          </div>
        </form>
      ) : !e?.cadastrado ? (
        <p className="rounded-xl bg-surface-sunken p-4 text-sm text-ink-muted">
          Seu número ainda não foi cadastrado no CRM. Peça ao administrador para ligar o seu
          WhatsApp em Usuários.
        </p>
      ) : (
        <>
          {e.conectado ? (
            <div className="flex items-center gap-3 rounded-xl bg-mint-soft p-4">
              <CircleCheck className="size-8 shrink-0 text-mint-ink" aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold text-mint-ink">Conectado</p>
                <p className="truncate text-sm text-ink-muted">
                  {e.telefone ? formatarTelefone(e.telefone) : e.instancia}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid items-center gap-4 sm:grid-cols-[auto_1fr]">
              <QrCode vendedorId={vendedorId} />
              <ol className="list-decimal space-y-2 pl-5 text-sm">
                <li>Abra o WhatsApp no celular do vendedor.</li>
                <li>
                  Toque em <b>Mais opções</b> ou <b>Configurações</b> e depois em{" "}
                  <b>Aparelhos conectados</b>.
                </li>
                <li>
                  Toque em <b>Conectar um aparelho</b> e aponte o celular para o código.
                </li>
                <li className="text-ink-muted">
                  Esta tela muda para Conectado assim que o celular terminar de conectar.
                </li>
                {e.erro && <li className="text-danger">{e.erro}</li>}
              </ol>
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {admin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setInstancia(e.instancia);
                  setEditando(true);
                }}
              >
                Trocar instância
              </Button>
            )}
            {e.conectado && (
              <Button
                variant="danger"
                size="sm"
                disabled={desconectar.isPending}
                onClick={async () => {
                  if (
                    await confirmar(
                      "Desconectar o WhatsApp do CRM? Para voltar, é preciso ler o QR code de novo.",
                      "Desconectar",
                    )
                  )
                    desconectar.mutate();
                }}
              >
                <Unplug />
                Desconectar
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Quanto tempo o QR code fica na tela antes de pedir outro (o primeiro vale ~60 s). */
const VALIDADE_QR = 45_000;

/**
 * O QR code é buscado uma vez e só troca quando a pessoa pede: cada busca gera outro
 * código na W-API e derruba o pareamento em andamento, então nada de atualizar sozinho.
 */
function QrCode({ vendedorId }: { vendedorId: string | null }) {
  const qr = useQuery({
    queryKey: [CHAVE, vendedorId ?? "eu", "qr"],
    queryFn: () => chamar(qrCodeWhatsapp(vendedorId)),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  const [expirouEm, setExpirouEm] = useState<number | null>(null);
  useEffect(() => {
    if (!qr.dataUpdatedAt) return;
    const t = setTimeout(() => setExpirouEm(qr.dataUpdatedAt), VALIDADE_QR);
    return () => clearTimeout(t);
  }, [qr.dataUpdatedAt]);
  const expirado = expirouEm === qr.dataUpdatedAt;

  return (
    // O QR code só é lido com fundo branco, inclusive no tema escuro.
    <div className="relative mx-auto grid size-56 place-items-center overflow-hidden rounded-xl border bg-white p-2">
      {qr.data && (
        <img
          src={qr.data}
          alt="QR code para conectar o WhatsApp"
          className={cn("size-full", (expirado || qr.isFetching) && "opacity-10 blur-sm")}
        />
      )}
      {qr.isFetching ? (
        <p className="absolute text-sm font-medium text-ink-muted">Gerando o código...</p>
      ) : (
        (expirado || qr.error) && (
          <div className="absolute grid justify-items-center gap-2 p-4 text-center">
            <p className="text-sm text-ink-muted">
              {qr.error ? mensagemErro(qr.error) : "O código expirou."}
            </p>
            <Button size="sm" variant="accent" onClick={() => void qr.refetch()}>
              <RefreshCw />
              Gerar outro código
            </Button>
          </div>
        )
      )}
    </div>
  );
}

/** Cabeçalho das Conversas: o estado do número do vendedor; clicar abre o QR code. */
export function BotaoConexao() {
  const [aberto, setAberto] = useState(false);
  // Mesma chave do painel: com ele aberto, o botão acompanha o estado a cada 3 s.
  const { data } = useQuery({
    queryKey: [CHAVE, "eu", "estado"],
    queryFn: () => chamar(estadoWhatsapp(null)),
    refetchInterval: 60_000,
  });
  const conectado = !!data?.cadastrado && data.conectado;

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        title={conectado ? "WhatsApp conectado" : "WhatsApp desconectado"}
        className={cn(
          "hover:brightness-95",
          conectado
            ? "text-(--wa-verde) hover:text-(--wa-verde)"
            : data && "bg-warning-soft text-warning hover:bg-warning-soft hover:text-warning",
        )}
        onClick={() => setAberto(true)}
      >
        <Smartphone />
        {data && !conectado && "Conectar"}
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Seu WhatsApp no CRM</DialogTitle>
            <DialogDescription>
              Com o número conectado, as conversas do celular aparecem aqui e você responde pelo
              CRM.
            </DialogDescription>
          </DialogHeader>
          <ConexaoWhatsapp vendedorId={null} />
        </DialogContent>
      </Dialog>
    </>
  );
}

const quando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : null;

/**
 * Faixa no topo de todas as telas quando o WhatsApp cai: as mensagens param de chegar ao
 * CRM. O vendedor reconecta ali mesmo; o admin vê quais vendedores caíram.
 */
export function AvisoWhatsapp() {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const { data } = useQuery({
    queryKey: [CHAVE, "aviso"],
    queryFn: () => chamar(avisoWhatsapp()),
    refetchInterval: 60_000,
  });
  if (!data || (!data.meu && data.desconectados.length === 0)) return null;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-danger/30 bg-danger-soft px-4 py-2.5 text-sm text-danger md:px-8"
    >
      <TriangleAlert className="size-4 shrink-0" aria-hidden />
      {data.meu ? (
        <>
          <p className="min-w-0 flex-1">
            <b>Seu WhatsApp está desconectado do CRM.</b> As mensagens dos clientes não estão
            chegando aqui até você reconectar.
          </p>
          <Button size="sm" variant="destructive" onClick={() => setAberto(true)}>
            <Smartphone />
            Reconectar
          </Button>
          <Dialog
            open={aberto}
            onOpenChange={(a) => {
              setAberto(a);
              if (!a) void qc.invalidateQueries({ queryKey: [CHAVE] });
            }}
          >
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Reconectar o WhatsApp</DialogTitle>
                <DialogDescription>
                  Leia o QR code com o celular. Mensagens que chegaram enquanto estava desconectado
                  não entram no CRM.
                </DialogDescription>
              </DialogHeader>
              <ConexaoWhatsapp vendedorId={null} />
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <>
          <p className="min-w-0 flex-1">
            <b>WhatsApp desconectado:</b>{" "}
            {data.desconectados
              .map((d) => (d.desde ? `${d.nome} (desde ${quando(d.desde)})` : d.nome))
              .join(", ")}
            . As mensagens desses vendedores não estão chegando ao CRM.
          </p>
          <Button size="sm" variant="outline" asChild>
            <Link href="/admin/usuarios">Ver em Usuários</Link>
          </Button>
        </>
      )}
    </div>
  );
}
