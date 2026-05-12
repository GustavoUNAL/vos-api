# Multi-stage: build NestJS + Prisma Client; imagen final solo runtime.
# Requiere DATABASE_URL solo como placeholder en build (generate no conecta al servidor).

FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.cjs ./

# Placeholder para prisma.config / generate durante la construcción de la imagen
ENV DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/_docker_build"

RUN npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src

RUN npx prisma generate
RUN npm run build

# --- Runtime ---
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache libc6-compat openssl wget \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nestjs

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.cjs ./

ENV DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/_docker_build"

RUN npm ci --omit=dev \
  && npx prisma generate \
  && npm cache clean --force

COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY scripts/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chown nestjs:nodejs docker-entrypoint.sh && chmod +x docker-entrypoint.sh

USER nestjs

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
