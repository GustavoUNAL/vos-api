#!/usr/bin/env bash
# Despliegue seguro de VOS IA en el VPS.
# - No pisa .env (solo backup)
# - No corre seed ni create-*-user (no toca contraseñas ni datos)
# - migrate deploy (solo SQL aditivo)
# - No toca PM2 arandano-app (:3000)
# - HTTPS de vos-ia.com sin tocar arandanocafe.com
#
# Uso en el VPS:
#   bash ~/projects/vos-ai/vos-api/scripts/deploy-vos-ia-safe.sh
set -euo pipefail

API_DIR="${API_DIR:-$HOME/projects/vos-ai/vos-api}"
FRONT_DIR="${FRONT_DIR:-$HOME/projects/vos-ai/vos-front}"
DOMAIN="vos-ia.com"
WWW="www.vos-ia.com"
STAMP="$(date +%Y%m%d-%H%M%S)"
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}"

log() { echo "==> $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

[[ -d "$API_DIR" ]] || die "No está $API_DIR"
[[ -d "$FRONT_DIR" ]] || die "No está $FRONT_DIR"
[[ -f "$API_DIR/.env" ]] || die "Falta $API_DIR/.env — no se crea ni se pisa"
[[ -f "$FRONT_DIR/.env" ]] || die "Falta $FRONT_DIR/.env — no se crea ni se pisa"

log "Backup de .env (no se modifican)"
cp -a "$API_DIR/.env" "$API_DIR/.env.bak-${STAMP}"
cp -a "$FRONT_DIR/.env" "$FRONT_DIR/.env.bak-${STAMP}"

if [[ -f "$API_DIR/.env.local" ]]; then
  log "Moviendo vos-api/.env.local (pisa producción) a .env.local.bak-${STAMP}"
  mv "$API_DIR/.env.local" "$API_DIR/.env.local.bak-${STAMP}"
fi
if [[ -f "$FRONT_DIR/.env.local" ]]; then
  log "Moviendo vos-front/.env.local (pisa VITE_* al build) a .env.local.bak-${STAMP}"
  mv "$FRONT_DIR/.env.local" "$FRONT_DIR/.env.local.bak-${STAMP}"
fi

log "Git pull (solo fast-forward)"
cd "$API_DIR"
git fetch origin main
git merge --ff-only origin/main

cd "$FRONT_DIR"
git fetch origin main
git merge --ff-only origin/main

log "API: install, prisma, build, migrate deploy"
cd "$API_DIR"
npm ci
npx prisma generate
NODE_ENV=production npm run build
NODE_ENV=production npx prisma migrate deploy

log "Front: install + build"
cd "$FRONT_DIR"
npm ci
npm run build

if ! grep -q 'https://vos-ia.com/backend' dist/assets/*.js; then
  die "El build del front no embebe https://vos-ia.com/backend. Revisá vos-front/.env (VITE_API_URL) y volvé a correr el script. .env no se tocó."
fi

log "PM2 restart (solo vos-api y vos-front)"
cd "$API_DIR"
if pm2 describe vos-api &>/dev/null; then
  pm2 restart vos-api --update-env
else
  pm2 start ecosystem.vps.config.cjs --only vos-api
fi
if pm2 describe vos-front &>/dev/null; then
  pm2 restart vos-front --update-env
else
  pm2 start ecosystem.vps.config.cjs --only vos-front
fi
pm2 save

sleep 2
curl -fsS "http://127.0.0.1:3001/health" >/dev/null || die "API local :3001 no responde"
curl -fsS -o /dev/null "http://127.0.0.1:5174/" || die "Front local :5174 no responde"

log "Nginx HTTPS para ${DOMAIN} (sin tocar arandanocafe.com)"
if [[ ! -f "$NGINX_SITE" ]] || ! grep -q "ssl_certificate" "$NGINX_SITE" 2>/dev/null; then
  sudo cp "$API_DIR/deploy/nginx-vos-ia.conf.example" "$NGINX_SITE"
  sudo ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/${DOMAIN}"
  sudo nginx -t
  sudo systemctl reload nginx
  if command -v certbot >/dev/null 2>&1; then
    sudo certbot --nginx -d "$DOMAIN" -d "$WWW" \
      --non-interactive --agree-tos --register-unsafely-without-email --redirect \
      --keep-until-expiring || true
  fi
else
  log "Ya hay SSL en ${NGINX_SITE}; no se pisa el archivo de Certbot"
  sudo nginx -t
  sudo systemctl reload nginx
fi

echo ""
log "Verificación pública"
curl -sI -H "Origin: https://${DOMAIN}" "http://127.0.0.1:3001/health" | grep -i access-control || true
curl -fsS "http://127.0.0.1:3001/health" && echo ""
echo "Front local: $(curl -s http://127.0.0.1:5174/ | grep -oE '<title>[^<]+</title>' | head -1)"
echo ""
echo "Backups: .env.bak-${STAMP}"
echo "No se corrió seed ni create-*-user. arandano-app (:3000) no se tocó."
echo "Probá: https://${DOMAIN}  y  https://${DOMAIN}/backend/health"
