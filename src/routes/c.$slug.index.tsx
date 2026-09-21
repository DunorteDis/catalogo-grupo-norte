import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { LOGOS } from "@/lib/logos";

export const Route = createFileRoute("/c/$slug/")({
  head: () => ({
    meta: [
      { title: "Escolha a distribuidora — faça seu pedido" },
      {
        name: "description",
        content: "Escolha a distribuidora para ver o catálogo e montar seu pedido pelo WhatsApp.",
      },
      { property: "og:title", content: "Escolha a distribuidora — faça seu pedido" },
      {
        property: "og:description",
        content: "Escolha a distribuidora para ver o catálogo e montar seu pedido.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EscolherDistribuidora,
});

function EscolherDistribuidora() {
  const { slug } = Route.useParams();

  const vendedorQuery = useQuery({
    queryKey: ["vendedor", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendedores")
        .select("id, nome")
        .eq("slug", slug)
        .eq("ativo", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const distribuidorasQuery = useQuery({
    queryKey: ["distribuidoras-publicas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribuidoras")
        .select("id, nome, slug, cor")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

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
      <h1 className="mt-1 text-2xl font-extrabold">Escolha a distribuidora</h1>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {(distribuidorasQuery.data ?? []).map((d) => (
          <Link
            key={d.id}
            to="/c/$slug/$distribuidora"
            params={{ slug, distribuidora: d.slug }}
            className="flex h-24 items-center justify-center rounded-2xl border bg-card p-4 transition hover:shadow-md"
          >
            {LOGOS[d.slug] ? (
              <img src={LOGOS[d.slug]} alt={d.nome} className="max-h-14 w-auto object-contain" />
            ) : (
              <span className="text-lg font-extrabold" style={{ color: d.cor }}>
                {d.nome}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
