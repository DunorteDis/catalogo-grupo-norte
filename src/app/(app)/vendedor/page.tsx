"use client";

import { Check, Copy, ExternalLink, Link2, Loader2 } from "lucide-react";

import { PageHeader } from "@/components/abastex";
import { Button } from "@/components/ui/button";
import { MarcaCatalogo } from "@/components/marca-catalogo";
import { useCatalogosPublicos, type CatalogoPublico } from "@/hooks/use-catalogos-publicos";
import { useCopiado } from "@/hooks/use-copiado";
import { useMeuVendedor } from "@/hooks/use-meu-vendedor";

function CartaoLink({
  catalogo,
  url,
  copiado,
  onCopiar,
}: {
  catalogo: CatalogoPublico;
  url: string;
  copiado: boolean;
  onCopiar: () => void;
}) {
  return (
    <div className="ax-card flex items-center gap-3 p-4">
      <div className="flex h-12 min-w-0 flex-1 items-center">
        <MarcaCatalogo marca={catalogo} logoClassName="max-h-12 max-w-[7rem]" className="text-sm" />
      </div>
      <Button asChild size="icon" variant="ghost" title="Abrir como o cliente vê">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Abrir como o cliente vê"
        >
          <ExternalLink />
        </a>
      </Button>
      <Button size="sm" variant="outline" onClick={onCopiar}>
        {copiado ? <Check className="text-mint-ink" /> : <Copy />}
        {copiado ? "Copiado" : "Copiar link"}
      </Button>
    </div>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-ink-muted">
      {children}
    </h2>
  );
}

export default function PainelVendedor() {
  const vendedorQuery = useMeuVendedor();
  const catalogosQuery = useCatalogosPublicos();
  const [copiado, copiar] = useCopiado();

  const vendedor = vendedorQuery.data;
  const catalogos = catalogosQuery.data ?? [];
  const distribuidoras = catalogos.filter((c) => !c.personalizado);
  const extras = catalogos.filter((c) => c.personalizado);

  function linkDe(catalogoSlug: string) {
    return `${window.location.origin}/c/${vendedor?.slug}/${catalogoSlug}`;
  }

  if (vendedorQuery.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-ink-subtle" />
      </div>
    );
  }

  if (!vendedor) {
    return (
      <p className="py-16 text-center text-sm text-ink-muted">
        Sua conta ainda não está ligada a um cadastro de vendedor. Fale com o administrador.
      </p>
    );
  }

  const cartao = (c: CatalogoPublico) => (
    <CartaoLink
      key={c.id}
      catalogo={c}
      url={linkDe(c.slug)}
      copiado={copiado === c.id}
      onCopiar={() => copiar(c.id, linkDe(c.slug))}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={["Abastex", "Meus links"]}
        icon={Link2}
        tone="rose"
        title={`Olá, ${vendedor.nome}`}
        subtitle={`Escolha o catálogo, copie o link e envie para o cliente pelo WhatsApp. O pedido volta para o seu número: ${vendedor.whatsapp}.`}
      />

      <section className="flex flex-col gap-3">
        <Rotulo>Distribuidoras</Rotulo>
        <div className="grid gap-3 sm:grid-cols-2">{distribuidoras.map(cartao)}</div>
      </section>

      {extras.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <Rotulo>Links extras</Rotulo>
            <p className="mt-1 text-sm text-ink-muted">
              Seleções montadas pelo Grupo Norte, sem distribuidora fixa — campanhas, feiras e mixes
              da semana.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">{extras.map(cartao)}</div>
        </section>
      )}
    </div>
  );
}
