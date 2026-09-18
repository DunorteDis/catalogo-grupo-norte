import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, MessageCircle, Package, Users } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Catálogo Norte — pedidos por WhatsApp" },
      {
        name: "description",
        content:
          "Plataforma de catálogo de produtos por distribuidora: o cliente monta o pedido e envia direto ao vendedor pelo WhatsApp.",
      },
      { property: "og:title", content: "Catálogo Norte — pedidos por WhatsApp" },
      {
        property: "og:description",
        content: "Catálogo por distribuidora com pedido enviado direto ao vendedor no WhatsApp.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Catálogo digital
        </p>
        <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          Pedidos simples, direto no WhatsApp do vendedor.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-muted-foreground">
          Cada vendedor tem um link próprio com os produtos da sua distribuidora. O cliente escolhe
          os itens, define as quantidades e conclui o pedido — que chega pronto no WhatsApp do
          vendedor.
        </p>

        <div className="mt-8">
          <Link
            to="/admin"
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Entrar na administração
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          {[
            { icon: Package, titulo: "Catálogo por distribuidora", texto: "Escolha quais produtos aparecem em cada marca." },
            { icon: Users, titulo: "Links por vendedor", texto: "Cada vendedor recebe um link pronto para enviar." },
            { icon: MessageCircle, titulo: "Pedido no WhatsApp", texto: "A lista chega formatada no número do vendedor." },
          ].map((c) => (
            <div key={c.titulo} className="rounded-2xl border bg-card p-5">
              <c.icon className="h-5 w-5 text-primary" />
              <h2 className="mt-3 text-sm font-bold">{c.titulo}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{c.texto}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
