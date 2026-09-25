# Imagem de produção: build standalone do Next, rodando só com Node 22.
# Postgres e S3 são externos — tudo entra por variável de ambiente na hora de subir
# o container (ver docker-compose.yml). Nenhum segredo vai para dentro da imagem.

FROM node:22-slim AS build
WORKDIR /app
# O projeto usa bun.lock: o bun só instala; o build roda no Node, como em produção.
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0
# O server.js do standalone não leva public/ nem .next/static; ele serve os dois daqui.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 8080
CMD ["node", "server.js"]
