#!/usr/bin/env sh
# Arranque del contenedor: migraciones opcionales + proceso Node.
#
# RUN_MIGRATIONS_ON_START=true  → ejecuta `prisma migrate deploy` antes del API.
# Útil en un solo réplica o primera subida; en varias réplicas mejor migración en paso release/CI.
set -eu

if [ "${RUN_MIGRATIONS_ON_START:-}" = "true" ]; then
  echo "[entrypoint] prisma migrate deploy..."
  npx prisma migrate deploy
fi

exec node dist/main.js
