import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

// Substitui o @lovable.dev/vite-tanstack-config, que embalava estes plugins.
export default defineConfig(({ command }) => ({
  server: { port: 8080 },
  // Nativo do Vite — dispensa o plugin vite-tsconfig-paths e resolve o alias @/.
  resolve: { tsconfigPaths: true },
  plugins: [
    // tanstackStart precisa vir antes do viteReact, senão a geração de rotas e a
    // compilação das server functions falham.
    tanstackStart({
      // aponta para src/server.ts, nosso wrapper de erro de SSR
      server: { entry: "server" },
    }),
    // Alvo do deploy, só no build: fixar o preset no dev liga a emulação do
    // Cloudflare, que exige o wrangler instalado. Trocar aqui muda para bun,
    // node, vercel e afins.
    nitro(command === "build" ? { preset: "cloudflare-module" } : {}),
    viteReact(),
    tailwindcss(),
  ],
}));
