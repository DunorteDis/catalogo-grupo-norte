"use client";

import { useMutation } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCatalogosPublicos } from "@/hooks/use-catalogos-publicos";
import { useMeuVendedor } from "@/hooks/use-meu-vendedor";
import { chamar } from "@/lib/chamar";
import { mensagemErro } from "@/lib/erros";
import { chaveDoCliente } from "@/server/carteira";

/**
 * Menu com os catálogos do vendedor: o escolhido vira o link direto para ele, já com o
 * cliente (?c=), e o pedido feito por ali chega identificado. O cliente não passa pela
 * tela de escolha de catálogo. `children` é o botão que abre o menu.
 */
export function MenuLinkCatalogo({
  codcli,
  onLink,
  children,
}: {
  codcli: number;
  onLink: (url: string, catalogo: string) => void;
  children: ReactNode;
}) {
  const { data: vendedor } = useMeuVendedor();
  const { data: catalogos, isLoading } = useCatalogosPublicos(vendedor?.slug);
  const link = useMutation({
    mutationFn: async (c: { slug: string; nome: string }) => {
      const chave = await chamar(chaveDoCliente(codcli));
      return { url: `${window.location.origin}/c/${vendedor!.slug}/${c.slug}?c=${chave}`, ...c };
    },
    onSuccess: ({ url, nome }) => onLink(url, nome),
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={link.isPending}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        <DropdownMenuLabel>Qual catálogo mandar?</DropdownMenuLabel>
        {isLoading && <DropdownMenuItem disabled>Carregando os catálogos...</DropdownMenuItem>}
        {catalogos?.length === 0 && (
          <DropdownMenuItem disabled>Nenhum catálogo no ar.</DropdownMenuItem>
        )}
        {catalogos?.map((c) => (
          <DropdownMenuItem key={c.id} onSelect={() => link.mutate({ slug: c.slug, nome: c.nome })}>
            {c.nome}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
