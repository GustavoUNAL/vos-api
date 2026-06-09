#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Falta .env en vos-api. Copiá .env.production.example y completá los valores."
  exit 1
fi

PROFILE="${1:-full}"
echo "Desplegando VOS AI (profile: ${PROFILE})…"
docker compose -f docker-compose.vps.yml --profile "${PROFILE}" up -d --build

echo ""
echo "Verificación:"
API_PORT="${API_SERVER_PORT:-3000}"
sleep 3
curl -fsS "http://127.0.0.1:${API_PORT}/health" || echo "API aún iniciando — probá de nuevo en unos segundos."
