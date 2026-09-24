"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: ReactNode }) {
  // No estado, não no módulo: no servidor um cliente de módulo vazaria cache entre requisições.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Tela já aberta volta instantânea; as mutações já invalidam o que editam.
            staleTime: 60_000,
            // Uma tentativa cobre a falha de rede passageira; o resto nunca ia passar mesmo.
            retry: 1,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
