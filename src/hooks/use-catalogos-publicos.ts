import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type CatalogoPublico = {
  id: string;
  nome: string;
  slug: string;
  cor: string;
  emoji: string | null;
  imagem_url: string | null;
  personalizado: boolean;
};

/**
 * Catálogos que o cliente pode abrir: distribuidoras e personalizados são a
 * mesma coisa no banco, separados só pela marca `personalizado`. O painel do
 * vendedor e a tela de escolha do cliente compartilham a chave de cache — é uma
 * ida à rede só.
 */
export function useCatalogosPublicos() {
  return useQuery({
    queryKey: ["catalogos-publicos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribuidoras")
        .select("id, nome, slug, cor, emoji, imagem_url, personalizado")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as CatalogoPublico[];
    },
  });
}
