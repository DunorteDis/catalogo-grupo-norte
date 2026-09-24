"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { MarcaCatalogo } from "@/components/marca-catalogo";
import { useCatalogosPublicos, type CatalogoPublico } from "@/hooks/use-catalogos-publicos";
import { useVendedorPublico } from "@/hooks/use-vendedor-publico";

function CartaoCatalogo({ catalogo, slug }: { catalogo: CatalogoPublico; slug: string }) {
  return (
    <Link
      href={`/c/${slug}/${catalogo.slug}`}
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

export function EscolherCatalogo() {
  const { slug } = useParams<{ slug: string }>();

  const vendedorQuery = useVendedorPublico(slug);
  const catalogosQuery = useCatalogosPublicos();

  const catalogos = catalogosQuery.data ?? [];
  const distribuidoras = catalogos.filter((c) => !c.personalizado);
  const extras = catalogos.filter((c) => c.personalizado);

  // No servidor a query não roda: isLoading ficaria falso e mostraria "Link não
  // encontrado" antes de carregar.
  if (vendedorQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!vendedorQuery.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-bold">Link não encontrado</h1>
        <p className="text-sm text-muted-foreground">Peça um novo link para o seu vendedor.</p>
        <Link href="/" className="text-sm font-semibold underline">
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
      <h1 className="mt-1 text-2xl font-bold">Escolha o catálogo</h1>

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
