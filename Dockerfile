# syntax=docker/dockerfile:1.7
# Habilita `RUN --mount=type=secret`, usado abaixo para resolver o
# @petcardorg/shared sem deixar o NODE_AUTH_TOKEN nas camadas da imagem
# (Render expõe esse mount via "Secret Files" no dashboard — ver PC-092).

FROM node:20-alpine AS builder
WORKDIR /app

# openssl: exigido pelos engines do Prisma no Alpine (musl).
# python3/make/g++: fallback de build nativo para o bcrypt, caso a versão
# instalada não traga prebuild para linux-musl.
RUN apk add --no-cache openssl python3 make g++

# schema.prisma precisa existir antes do `npm ci` — o postinstall do
# package.json roda `prisma generate` na hora da instalação.
COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma

RUN --mount=type=secret,id=npm_auth_token \
    NODE_AUTH_TOKEN="$(cat /run/secrets/npm_auth_token)" npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Remove devDependencies do node_modules que vai para a imagem final.
# `prisma` (CLI) foi movido para "dependencies" de propósito: o
# entrypoint roda `prisma migrate deploy` em produção, então o CLI
# precisa sobreviver a este prune.
RUN npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json ./
COPY docker/entrypoint.sh ./docker/entrypoint.sh
RUN chmod +x ./docker/entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker/entrypoint.sh"]
