import { useQuery } from "@tanstack/react-query";

import { chamar } from "@/lib/chamar";
import { catalogosDoVendedor } from "@/server/publico";

export type CatalogoPublico = {
  id: string;
  nome: string;
  slug: string;
  cor: string;
  emoji: string | null;
  imagem_url: string | null;
  logo_url: string | null;
  personalizado: boolean;
};

/**
 * Catálogos que o cliente do link pode abrir: os da distribuidora do vendedor. O
 * painel do vendedor e a tela de escolha do cliente usam a mesma chave — uma ida
 * à rede só.
 */
export function useCatalogosPublicos(vendedorSlug: string | undefined) {
  return useQuery({
    queryKey: ["catalogos-publicos", vendedorSlug],
    enabled: !!vendedorSlug,
    queryFn: () => chamar(catalogosDoVendedor(vendedorSlug!)),
  });
}
