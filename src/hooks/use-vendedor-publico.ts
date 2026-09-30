import { useQuery } from "@tanstack/react-query";

import { chamar } from "@/lib/chamar";
import { vendedorPorSlug } from "@/server/publico";

/**
 * O catálogo público precisa de UM vendedor — o do slug que o cliente recebeu.
 * A lista de vendedores não é pública, senão qualquer um baixava nome e WhatsApp
 * da equipe inteira.
 */
export function useVendedorPublico(slug: string) {
  return useQuery({
    queryKey: ["vendedor", slug],
    queryFn: () => chamar(vendedorPorSlug(slug)),
  });
}
