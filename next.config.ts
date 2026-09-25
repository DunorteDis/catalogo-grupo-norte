import type { NextConfig } from "next";

const config: NextConfig = {
  // .next/standalone traz server.js e só o node_modules que o app usa: é o que vai para a imagem Docker.
  output: "standalone",
  experimental: {
    // A foto do produto vai até 5 MB (a do catálogo, 2 MB) e o padrão das Server Actions é 1 MB.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default config;
