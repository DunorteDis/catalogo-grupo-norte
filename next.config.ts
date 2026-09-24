import type { NextConfig } from "next";

const config: NextConfig = {
  experimental: {
    // A imagem do catálogo vai até 2 MB e o padrão das Server Actions é 1 MB.
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default config;
