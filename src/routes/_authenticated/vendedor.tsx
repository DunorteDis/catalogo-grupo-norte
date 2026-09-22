import { createFileRoute } from "@tanstack/react-router";
import { Copy, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { MarcaCatalogo } from "@/components/marca-catalogo";
import { useCatalogosPublicos, type CatalogoPublico } from "@/hooks/use-catalogos-publicos";
import { useMeuVendedor } from "@/hooks/use-meu-vendedor";

export const Route = createFileRoute("/_authenticated/vendedor")({
  component: PainelVendedor,
});

function CartaoLink({
  catalogo,
  url,
  onCopiar,
}: {
  catalogo: CatalogoPublico;
  url: string;
  onCopiar: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-4">
      <div className="flex h-12 min-w-0 flex-1 items-center">
        <MarcaCatalogo marca={catalogo} logoClassName="max-h-12 max-w-[7rem]" className="text-sm" />
      </div>
      <Button asChild size="icon" variant="ghost" title="Abrir como o cliente vê">
        <a href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-4 w-4" />
        </a>
      </Button>
      <Button size="sm" className="rounded-xl font-bold" onClick={onCopiar}>
        <Copy className="mr-2 h-4 w-4" />
        Copiar link
      </Button>
    </div>
  );
}

function PainelVendedor() {
  // ponytail: o usuario ja vem do contexto da rota; getUser() aqui era mais uma
  // ida a rede so para descobrir o id que o shell ja tinha.
  const { user } = Route.useRouteContext();

  const vendedorQuery = useMeuVendedor(user.id);
  const catalogosQuery = useCatalogosPublicos();

  const vendedor = vendedorQuery.data;
  const catalogos = catalogosQuery.data ?? [];
  const distribuidoras = catalogos.filter((c) => !c.personalizado);
  const extras = catalogos.filter((c) => c.personalizado);

  function linkDe(catalogoSlug: string) {
    return `${window.location.origin}/c/${vendedor?.slug}/${catalogoSlug}`;
  }

  function copiar(catalogoSlug: string, nome: string) {
    if (!vendedor) return;
    navigator.clipboard.writeText(linkDe(catalogoSlug));
    toast.success(`Link do catálogo ${nome} copiado!`);
  }

  if (vendedorQuery.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!vendedor) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Sua conta ainda não está ligada a um cadastro de vendedor. Fale com o administrador.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-extrabold">Olá, {vendedor.nome}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Escolha o catálogo, copie o link e envie para o cliente pelo WhatsApp. O pedido volta para o
        seu número: {vendedor.whatsapp}.
      </p>

      <h2 className="mt-8 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Distribuidoras
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {distribuidoras.map((c) => (
          <CartaoLink
            key={c.id}
            catalogo={c}
            url={linkDe(c.slug)}
            onCopiar={() => copiar(c.slug, c.nome)}
          />
        ))}
      </div>

      {extras.length > 0 && (
        <>
          <h2 className="mt-8 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Links extras
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Seleções montadas pelo Grupo Norte, sem distribuidora fixa — campanhas, feiras e mixes
            da semana.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {extras.map((c) => (
              <CartaoLink
                key={c.id}
                catalogo={c}
                url={linkDe(c.slug)}
                onCopiar={() => copiar(c.slug, c.nome)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
