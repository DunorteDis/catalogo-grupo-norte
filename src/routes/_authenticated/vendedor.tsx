import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/vendedor")({
  component: PainelVendedor,
});

function PainelVendedor() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const vendedorQuery = useQuery({
    queryKey: ["meu-vendedor"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data, error } = await supabase
        .from("vendedores")
        .select("id, nome, slug, whatsapp")
        .eq("user_id", auth.user.id)
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
        .select("id, nome, slug, logo_url, cor")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  function copiar(distribuidoraSlug: string, nome: string) {
    const vendedor = vendedorQuery.data;
    if (!vendedor) return;
    const url = `${window.location.origin}/c/${vendedor.slug}/${distribuidoraSlug}`;
    navigator.clipboard.writeText(url);
    toast.success(`Link do catálogo ${nome} copiado!`);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
          <span className="text-sm font-extrabold">Área do vendedor</span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={sair}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {vendedorQuery.isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !vendedorQuery.data ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Sua conta ainda não está ligada a um cadastro de vendedor. Fale com o administrador.
          </p>
        ) : (
          <>
            <h1 className="text-2xl font-extrabold">Olá, {vendedorQuery.data.nome}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Escolha a distribuidora, copie o link e envie para o cliente pelo WhatsApp. O pedido
              volta para o seu número: {vendedorQuery.data.whatsapp}.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {(distribuidorasQuery.data ?? []).map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-3 rounded-2xl border bg-card p-4"
                >
                  <div className="flex h-12 w-28 shrink-0 items-center justify-center">
                    {d.logo_url ? (
                      <img src={d.logo_url} alt={d.nome} className="max-h-12 w-auto object-contain" />
                    ) : (
                      <span className="text-sm font-extrabold" style={{ color: d.cor }}>
                        {d.nome}
                      </span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    className="ml-auto rounded-xl font-bold"
                    onClick={() => copiar(d.slug, d.nome)}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar link
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
