import { useQuery } from "@tanstack/react-query";

import { chamar } from "@/lib/chamar";
import { meuVendedor } from "@/server/pedidos";

/**
 * Cadastro de vendedor da conta logada. Fica num hook porque duas telas precisam
 * dele — com a chave de cache igual nas duas, é uma ida à rede só. A conta vem da
 * sessão no servidor; o logout limpa o cache.
 */
export function useMeuVendedor() {
  return useQuery({ queryKey: ["meu-vendedor"], queryFn: () => chamar(meuVendedor()) });
}
