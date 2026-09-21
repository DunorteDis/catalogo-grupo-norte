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
    // Alvo do deploy, só no build: fixar o preset no dev ligaria a emulação do
    // provedor, que no caso da Cloudflare ainda exigia o wrangler instalado.
    // O build sai em .vercel/output (Build Output API v3), que a Vercel lê sozinha.
    nitro(command === "build" ? { preset: "vercel" } : {}),
    viteReact(),
    tailwindcss(),
  ],
}));
