#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONT="${ROOT}/../vos-front"

echo "==> VOS AI — deploy PM2 (VPS)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Falta .env. Copiá: cp .env.vps.example .env && nano .env"
  exit 1
fi

if [[ -f .env.local ]]; then
  echo "⚠️  Encontré .env.local en vos-api. En producción puede pisar CORS/PORT."
  echo "    Recomendado: mv .env.local .env.local.bak"
fi

echo "==> API: install, prisma, build, migrate"
npm ci
npx prisma generate
npm run build
npm run db:migrate

if [[ -d "$FRONT" ]]; then
  echo "==> Front: dependencias"
  cd "$FRONT"
  if [[ ! -f .env.local ]]; then
    echo "Falta vos-front/.env.local. Copiá: cp .env.vps.example .env.local"
    exit 1
  fi
  npm ci
  cd "$ROOT"
else
  echo "⚠️  No encontré ${FRONT}"
fi

echo "==> PM2"
if pm2 describe vos-api &>/dev/null; then
  pm2 restart ecosystem.vps.config.cjs
else
  pm2 start ecosystem.vps.config.cjs
fi
pm2 save

sleep 2
echo ""
echo "==> Verificación"
curl -fsS "http://127.0.0.1:3001/health" && echo ""
curl -sI -H "Origin: http://51.222.24.228:5174" "http://127.0.0.1:3001/health" | grep -i access-control || true
echo ""
echo "Listo. Front: http://51.222.24.228:5174  |  API: http://51.222.24.228:3001"
