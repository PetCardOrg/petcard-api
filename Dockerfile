# syntax=docker/dockerfile:1

# --- deps: instala dependências (com devDependencies) e gera o client do Prisma ---
FROM node:20-slim AS deps
WORKDIR /app
COPY .npmrc package.json package-lock.json ./
COPY prisma ./prisma
RUN --mount=type=secret,id=node_auth_token \
    NODE_AUTH_TOKEN="$(cat /run/secrets/node_auth_token)" npm ci

# --- build: compila o Nest ---
FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build && npm prune --omit=dev

# --- runtime: só o necessário pra rodar ---
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nestjs
COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/dist ./dist
COPY --from=build --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nestjs:nodejs /app/package.json ./package.json
USER nestjs
EXPOSE 3000
CMD ["node", "dist/main.js"]
