"use client";

import { useQuery } from "@tanstack/react-query";
import { WalletCards } from "lucide-react";

import { PageHeader } from "@/components/abastex";
import { ListaCarteira } from "@/components/carteira-clientes";
import { chamar } from "@/lib/chamar";
import { minhaCarteira } from "@/server/carteira";

/** Carteira do vendedor logado: os clientes dele no Winthor e as condições de cada um. */
export default function MinhaCarteira() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["minha-carteira"],
    queryFn: () => chamar(minhaCarteira()),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={WalletCards}
        tone="accent"
        title="Minha carteira"
        subtitle={
          data
            ? `Seus clientes no Winthor (cód. usuário ${data.codusur}). Toque num cliente para ver crédito, títulos em aberto e bloqueio.`
            : "Seus clientes no Winthor. Toque num cliente para ver crédito, títulos em aberto e bloqueio."
        }
      />
      <ListaCarteira clientes={data?.clientes} carregando={isLoading} erro={error} />
    </div>
  );
}
