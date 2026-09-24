import type { NextConfig } from "next";

const config: NextConfig = {
  experimental: {
    // A foto do produto vai até 5 MB (a do catálogo, 2 MB) e o padrão das Server Actions é 1 MB.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default config;
