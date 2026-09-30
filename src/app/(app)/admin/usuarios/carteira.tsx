"use client";

import { useQuery } from "@tanstack/react-query";
import { WalletCards } from "lucide-react";

import { IconTile } from "@/components/abastex";
import { ListaCarteira } from "@/components/carteira-clientes";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { chamar } from "@/lib/chamar";
import { carteiraVendedor } from "@/server/carteira";

/**
 * Painel lateral com os clientes do vendedor no Winthor, pelo codusur dele. O
 * `vendedor` fica mesmo com o painel fechando, para o conteúdo não sumir na animação.
 */
export function CarteiraVendedor({
  vendedor,
  aberto,
  onFechar,
}: {
  vendedor: { id: string; nome: string; codusur: number | null } | null;
  aberto: boolean;
  onFechar: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["carteira", vendedor?.id],
    queryFn: () => chamar(carteiraVendedor(vendedor!.id)),
    enabled: aberto && !!vendedor,
  });

  return (
    <Sheet open={aberto && !!vendedor} onOpenChange={(a) => !a && onFechar()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b bg-brand-soft px-6 py-5 text-left">
          <div className="flex items-center gap-3 pr-8">
            <IconTile icon={WalletCards} tone="brand" />
            <div className="min-w-0">
              <SheetTitle className="truncate">Carteira de {vendedor?.nome}</SheetTitle>
              <SheetDescription>
                Clientes do cód. usuário {vendedor?.codusur} no Winthor. Toque num cliente para ver
                crédito, títulos e bloqueio.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <ListaCarteira clientes={data} carregando={isLoading} erro={error} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
