import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * Cadastro de vendedor da conta logada. Fica num hook porque duas telas precisam
 * dele — com a chave de cache igual nas duas, é uma ida à rede só.
 */
export function useMeuVendedor(userId: string) {
  return useQuery({
    queryKey: ["meu-vendedor", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendedores")
        .select("id, nome, slug, whatsapp")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
