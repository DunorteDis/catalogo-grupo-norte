import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * O catálogo público precisa de UM vendedor — o do slug que o cliente recebeu.
 * Vem por função, não por SELECT na tabela: `vendedores` não é mais legível por
 * anônimo, senão qualquer um baixava nome e WhatsApp da equipe inteira.
 */
export function useVendedorPublico(slug: string) {
  return useQuery({
    queryKey: ["vendedor", slug],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("vendedor_por_slug", { p_slug: slug });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}
