FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install --global esbuild@0.28.2

COPY package.json package-lock.json ./
COPY api/package.json ./api/package.json
COPY shared/package.json ./shared/package.json
COPY app/package.json ./app/package.json
RUN npm ci --workspace=api --workspace=shared --include-workspace-root=false

COPY tsconfig.json ./
COPY api/src ./api/src
COPY shared ./shared
RUN esbuild api/src/server.ts \
    --bundle --platform=node --target=node24 --format=esm \
    --banner:js='import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' \
    --outfile=api/dist/server.mjs

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/api/dist/server.mjs ./server.mjs
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
