import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Sem staleTime o React Query refaz a busca toda vez que a tela e aberta, e
  // cada ida ao Supabase custa ~300-600ms. Com 1 min de frescor, revisitar uma
  // tela ja aberta e instantaneo. Mutacoes ja chamam invalidateQueries, entao
  // isso nao segura dado editado.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        // O padrão são 3 tentativas com backoff: ~15s de tela "Carregando" antes
        // de mostrar o erro. Uma tentativa cobre a falha de rede passageira; o
        // resto (permissão, configuração) nunca ia passar mesmo.
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
