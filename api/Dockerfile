FROM node:24-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY api/package.json ./api/package.json
COPY shared/package.json ./shared/package.json
COPY app/package.json ./app/package.json
RUN npm ci --workspace=api --workspace=shared --include-workspace-root=false

COPY tsconfig.json ./
COPY api/scripts ./api/scripts
COPY api/src ./api/src
COPY shared ./shared
RUN npm run build --workspace=api

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/api/dist/server.mjs ./server.mjs
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
