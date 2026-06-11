#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONT="${ROOT}/../vos-front"

echo "==> VOS AI — deploy PM2 (VPS)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Falta vos-api/.env. Copiá: cp .env.production.example .env && nano .env"
  exit 1
fi

if [[ -f .env.local ]]; then
  echo "⚠️  Encontré vos-api/.env.local. En producción pisa CORS/PORT."
  echo "    Recomendado: mv .env.local .env.local.bak"
fi

echo "==> API: install, prisma, build, migrate"
npm ci
npx prisma generate
NODE_ENV=production npm run build
NODE_ENV=production npm run db:migrate

if [[ -d "$FRONT" ]]; then
  echo "==> Front: dependencias + build"
  cd "$FRONT"
  if [[ ! -f .env ]]; then
    echo "Falta vos-front/.env. Copiá: cp .env.production.example .env"
    exit 1
  fi
  if [[ -f .env.local ]]; then
    echo "⚠️  Encontré vos-front/.env.local. En producción pisa VITE_* al compilar."
    echo "    Recomendado: mv .env.local .env.local.bak"
  fi
  npm ci
  npm run build
  cd "$ROOT"
else
  echo "⚠️  No encontré ${FRONT}"
fi

echo "==> PM2"
if pm2 describe vos-api &>/dev/null; then
  pm2 restart ecosystem.vps.config.cjs --update-env
else
  pm2 start ecosystem.vps.config.cjs
fi
pm2 save

sleep 2
echo ""
echo "==> Verificación"
curl -fsS "http://127.0.0.1:3001/health" && echo ""
curl -sI -H "Origin: https://vos-ai.arandano.shop" "http://127.0.0.1:3001/health" | grep -i access-control || true
echo ""
echo "Listo. Front: https://vos-ai.arandano.shop  |  API: https://vos-ai.arandano.shop/backend"
