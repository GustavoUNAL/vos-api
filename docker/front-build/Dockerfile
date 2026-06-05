# Dockerfile para apps Vite/React en la raíz del repositorio front.
# Uso con docker-compose: FRONTEND_BUILD_CONTEXT apunta a ese repo;
# FRONTEND_DOCKERFILE=docker/front-build/Dockerfile (ruta relativa al repo del API).
#
# Requisitos en el front: script `npm run build` y salida en `dist/`.
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json ./
COPY package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

ARG VITE_API_URL=http://localhost:3000
ARG VITE_PLATFORM_MODE=true
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_PLATFORM_MODE=$VITE_PLATFORM_MODE

RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
RUN printf '%s\n' \
  'server {' \
  '  listen 80;' \
  '  server_name _;' \
  '  root /usr/share/nginx/html;' \
  '  location / {' \
  '    try_files $uri $uri/ /index.html;' \
  '  }' \
  '}' > /etc/nginx/conf.d/default.conf
