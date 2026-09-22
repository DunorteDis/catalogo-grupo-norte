import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { MarcaCatalogo } from "@/components/marca-catalogo";
import { useCatalogosPublicos, type CatalogoPublico } from "@/hooks/use-catalogos-publicos";
import { useVendedorPublico } from "@/hooks/use-vendedor-publico";

export const Route = createFileRoute("/c/$slug/")({
  head: () => ({
    meta: [
      { title: "Escolha o catálogo — faça seu pedido" },
      {
        name: "description",
        content: "Escolha o catálogo para ver os produtos e montar seu pedido pelo WhatsApp.",
      },
      { property: "og:title", content: "Escolha o catálogo — faça seu pedido" },
      {
        property: "og:description",
        content: "Escolha o catálogo para ver os produtos e montar seu pedido.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EscolherCatalogo,
});

function CartaoCatalogo({ catalogo, slug }: { catalogo: CatalogoPublico; slug: string }) {
  return (
    <Link
      to="/c/$slug/$distribuidora"
      params={{ slug, distribuidora: catalogo.slug }}
      className="flex h-24 items-center justify-center rounded-2xl border bg-card p-4 transition hover:shadow-md"
      // Catálogo personalizado não tem logo: quem dá identidade ao cartão é a
      // cor escolhida no painel, aplicada de leve no fundo e na borda.
      style={
        catalogo.personalizado
          ? { backgroundColor: `${catalogo.cor}14`, borderColor: `${catalogo.cor}55` }
          : undefined
      }
    >
      <MarcaCatalogo marca={catalogo} logoClassName="max-h-14" className="text-lg" />
    </Link>
  );
}

function EscolherCatalogo() {
  const { slug } = Route.useParams();

  const vendedorQuery = useVendedorPublico(slug);
  const catalogosQuery = useCatalogosPublicos();

  const catalogos = catalogosQuery.data ?? [];
  const distribuidoras = catalogos.filter((c) => !c.personalizado);
  const extras = catalogos.filter((c) => c.personalizado);

  if (vendedorQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!vendedorQuery.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-extrabold">Link não encontrado</h1>
        <p className="text-sm text-muted-foreground">Peça um novo link para o seu vendedor.</p>
        <Link to="/" className="text-sm font-semibold underline">
          Ir para o início
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Vendedor {vendedorQuery.data.nome}
      </p>
      <h1 className="mt-1 text-2xl font-extrabold">Escolha o catálogo</h1>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {distribuidoras.map((c) => (
          <CartaoCatalogo key={c.id} catalogo={c} slug={slug} />
        ))}
      </div>

      {extras.length > 0 && (
        <>
          <h2 className="mt-8 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Seleções especiais
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {extras.map((c) => (
              <CartaoCatalogo key={c.id} catalogo={c} slug={slug} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
