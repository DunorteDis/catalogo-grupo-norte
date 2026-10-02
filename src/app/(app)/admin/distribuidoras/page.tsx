"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Check, ImagePlus, Plus, Warehouse } from "lucide-react";
import { toast } from "sonner";

import { chamar } from "@/lib/chamar";
import { mensagemErro } from "@/lib/erros";
import { COR_PADRAO, MAX_IMAGEM, slugify, TIPOS_IMAGEM } from "@/lib/catalogo";
import { Badge, DistributorCard, PageHeader } from "@/components/abastex";
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
import { LOGOS } from "@/lib/logos";
import {
  ativarDistribuidora,
  criarDistribuidora,
  enviarImagem,
  listarDistribuidoras,
} from "@/server/catalogos";

export default function DistribuidorasPage() {
  const qc = useQueryClient();
  const [novaAberta, setNovaAberta] = useState(false);

  const { data } = useQuery({
    queryKey: ["admin-distribuidoras-full"],
    queryFn: () => chamar(listarDistribuidoras()),
  });

  const alternar = useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) =>
      chamar(ativarDistribuidora(id, ativo)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-distribuidoras-full"] });
      qc.invalidateQueries({ queryKey: ["catalogos"] });
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const lista = data ?? [];
  const ativas = lista.filter((d) => d.ativo).length;
  const inativas = lista.length - ativas;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Warehouse}
        tone="info"
        title="Distribuidoras"
        subtitle="Só o TI vê esta tela. Desligar uma distribuidora tira do ar tudo dela: o acesso dos usuários, os catálogos dela e os de outras distribuidoras com a marca dela."
        actions={
          <>
            {data && (
              <>
                <Badge tone="accent" icon={Check}>
                  {ativas} {ativas === 1 ? "ativa" : "ativas"}
                </Badge>
                {inativas > 0 && (
                  <Badge dot>
                    {inativas} {inativas === 1 ? "inativa" : "inativas"}
                  </Badge>
                )}
              </>
            )}
            <Button onClick={() => setNovaAberta(true)}>
              <Plus />
              Nova distribuidora
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map((d) => {
          const logo = LOGOS[d.slug] ?? d.logo_url;
          return (
            <DistributorCard
              key={d.id}
              name={d.nome}
              color={d.cor}
              active={!!d.ativo}
              onToggle={(v) => alternar.mutate({ id: d.id, ativo: v })}
              logo={logo ? <img src={logo} alt={d.nome} /> : undefined}
            />
          );
        })}
      </div>

      <Dialog open={novaAberta} onOpenChange={setNovaAberta}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
          {/* Montado só aberto: cada abertura começa com o formulário limpo. */}
          {novaAberta && <NovaDistribuidora aoCriar={() => setNovaAberta(false)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NovaDistribuidora({ aoCriar }: { aoCriar: () => void }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState(COR_PADRAO);
  const [logo, setLogo] = useState<File | null>(null);
  const inputLogo = useRef<HTMLInputElement>(null);

  // ponytail: o blob da prévia não é revogado — é um logo por vez, num diálogo do admin.
  const previa = useMemo(() => (logo ? URL.createObjectURL(logo) : null), [logo]);
  const slug = slugify(nome);

  function escolherLogo(arquivo: File | undefined) {
    if (!arquivo) return;
    if (!TIPOS_IMAGEM.includes(arquivo.type)) {
      toast.error("Use uma imagem PNG, JPG, WEBP ou GIF.");
      return;
    }
    if (arquivo.size > MAX_IMAGEM) {
      toast.error("A imagem passa de 2 MB. Diminua o tamanho e tente de novo.");
      return;
    }
    setLogo(arquivo);
  }

  const criar = useMutation({
    mutationFn: async () => {
      // O logo só sobe ao criar: cancelar não deixa imagem solta no banco.
      const dados = new FormData();
      dados.set("arquivo", logo!);
      const logoUrl = await chamar(enviarImagem(dados));
      return chamar(criarDistribuidora({ nome, cor, logoUrl }));
    },
    onSuccess: () => {
      toast.success(`Distribuidora ${nome.trim()} criada.`);
      qc.invalidateQueries({ queryKey: ["admin-distribuidoras-full"] });
      // Aparece também na tela Catálogos, para receber os produtos.
      qc.invalidateQueries({ queryKey: ["catalogos"] });
      qc.invalidateQueries({ queryKey: ["catalogos-publicos"] });
      aoCriar();
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const podeCriar = slug !== "" && logo !== null && !criar.isPending;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (podeCriar) criar.mutate();
      }}
      className="space-y-5"
    >
      <DialogHeader>
        <DialogTitle>Nova distribuidora</DialogTitle>
        <DialogDescription>
          Pode ser quem usa o sistema (ganha usuários pela tela Usuários, com o TI dentro dela) e
          marca de catálogo para qualquer distribuidora.
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-end gap-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="nome-distribuidora">Nome</Label>
          <Input
            id="nome-distribuidora"
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Nortemix Distribuidora"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cor-distribuidora">Cor</Label>
          <input
            id="cor-distribuidora"
            type="color"
            value={cor}
            onChange={(e) => setCor(e.target.value)}
            className="block h-10 w-16 cursor-pointer rounded-md border border-input bg-card p-1"
          />
        </div>
      </div>
      <p className="-mt-3 font-mono text-xs text-muted-foreground">
        /c/&lt;vendedor&gt;/{slug || "…"}
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="logo-distribuidora">Logo</Label>
        <input
          ref={inputLogo}
          id="logo-distribuidora"
          type="file"
          accept={TIPOS_IMAGEM.join(",")}
          hidden
          onChange={(e) => {
            escolherLogo(e.target.files?.[0]);
            // Limpa para que escolher o mesmo arquivo de novo ainda dispare o change.
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => inputLogo.current?.click()}
          className="flex w-full cursor-pointer items-center gap-4 rounded-2xl border-2 border-dashed border-line-strong bg-surface-sunken p-3 text-left transition-colors hover:border-brand hover:bg-surface-hover"
        >
          <span className="grid h-16 w-28 shrink-0 place-items-center overflow-hidden rounded-md bg-card">
            {previa ? (
              <img src={previa} alt="" className="h-full w-full object-contain p-1.5" />
            ) : (
              <ImagePlus className="size-6 text-ink-subtle" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block font-semibold text-ink">
              {logo ? "Trocar logo" : "Escolher logo"}
            </span>
            <span className="mt-0.5 block text-xs text-ink-muted">
              PNG, JPG, WEBP ou GIF de até 2 MB. Fundo transparente fica melhor.
            </span>
          </span>
        </button>
      </div>

      <div className="space-y-1.5">
        <Label>Como fica</Label>
        <DistributorCard
          name={nome.trim() || "Nova distribuidora"}
          color={cor}
          active
          disabled
          logo={previa ? <img src={previa} alt="" /> : undefined}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={aoCriar}>
          Cancelar
        </Button>
        <Button type="submit" variant="accent" disabled={!podeCriar}>
          {criar.isPending ? "Criando..." : "Criar distribuidora"}
        </Button>
      </DialogFooter>
    </form>
  );
}
