#!/usr/bin/env bash
# Configura vos-ia.com en el VPS: Nginx, .env, Vite, rebuild, PM2 y Certbot.
# Uso (en el VPS):
#   bash ~/projects/vos-ai/vos-api/scripts/setup-vos-ia-domain.sh
set -euo pipefail

DOMAIN="vos-ia.com"
WWW="www.vos-ia.com"
OLD_DOMAIN="vos-ai.arandano.shop"
VPS_IP="51.222.24.228"
API_DIR="${API_DIR:-$HOME/projects/vos-ai/vos-api}"
FRONT_DIR="${FRONT_DIR:-$HOME/projects/vos-ai/vos-front}"
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}"

if [[ ! -d "$API_DIR" || ! -d "$FRONT_DIR" ]]; then
  echo "No encontré $API_DIR o $FRONT_DIR"
  exit 1
fi

upsert_env() {
  local file="$1"
  shift
  python3 - "$file" "$@" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
updates = dict(item.split("=", 1) for item in sys.argv[2:])
text = path.read_text() if path.exists() else ""
lines = text.splitlines()
seen = set()
out = []
for line in lines:
    raw = line.strip()
    if raw and not raw.startswith("#") and "=" in raw:
        key = raw.split("=", 1)[0].strip()
        if key in updates:
            out.append(f"{key}={updates[key]}")
            seen.add(key)
            continue
    out.append(line)
for key, value in updates.items():
    if key not in seen:
        out.append(f"{key}={value}")
path.write_text("\n".join(out) + "\n")
PY
}

echo "==> 1/5 Nginx"
sudo tee "$NGINX_SITE" >/dev/null <<EOF
server {
  listen 80;
  listen [::]:80;
  server_name ${DOMAIN} ${WWW} ${OLD_DOMAIN};

  client_max_body_size 20m;

  location /backend/ {
    proxy_pass http://127.0.0.1:3001/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 120s;
  }

  location /ws {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
  }

  location / {
    proxy_pass http://127.0.0.1:5174;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
EOF

sudo ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/${DOMAIN}"
sudo rm -f "/etc/nginx/sites-enabled/${OLD_DOMAIN}"
sudo nginx -t
sudo systemctl reload nginx
echo "Nginx listo."

echo "==> 2/5 Variables .env"
rm -f "$API_DIR/.env.local" "$FRONT_DIR/.env.local"
[[ -f "$API_DIR/.env" ]] || { echo "Falta $API_DIR/.env"; exit 1; }
[[ -f "$FRONT_DIR/.env" ]] || { echo "Falta $FRONT_DIR/.env"; exit 1; }
cp -a "$API_DIR/.env" "$API_DIR/.env.bak-vos-ia"
cp -a "$FRONT_DIR/.env" "$FRONT_DIR/.env.bak-vos-ia"

upsert_env "$API_DIR/.env" \
  "CORS_ORIGIN=https://${DOMAIN},https://${WWW},https://${OLD_DOMAIN}" \
  "SHOP_FRONT_URL=https://${DOMAIN}"

upsert_env "$FRONT_DIR/.env" \
  "VITE_API_URL=https://${DOMAIN}/backend" \
  "VITE_APP_URL=https://${DOMAIN}" \
  "VITE_LANDING_URL=https://${DOMAIN}/#/" \
  "VITE_SHOP_FRONT_URL=https://${DOMAIN}" \
  "VITE_SHOP_URL=https://${DOMAIN}/#/tienda/arandano"

python3 - "$FRONT_DIR/vite.config.ts" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text()
hosts = ["'vos-ia.com'", "'www.vos-ia.com'", "'.vos-ia.com'"]
if "vos-ia.com" in text:
    print("vite.config.ts ya tiene vos-ia.com")
    raise SystemExit(0)
needle = "'127.0.0.1',"
if needle not in text:
    raise SystemExit("No pude editar vite.config.ts: falta 127.0.0.1")
insert = needle + "\n  " + ",\n  ".join(hosts) + ","
path.write_text(text.replace(needle, insert, 1))
print("vite.config.ts actualizado")
PY

echo "==> 3/5 Build front + PM2"
cd "$FRONT_DIR"
npm run build
cd "$API_DIR"
pm2 restart vos-front --update-env
pm2 restart vos-api --update-env
pm2 save

echo "==> 4/5 Certificado HTTPS"
resolve_ip() {
  local host="$1"
  if command -v dig >/dev/null 2>&1; then
    dig +short "$host" A | tail -n1
  else
    getent ahostsv4 "$host" | awk '{print $1; exit}'
  fi
}

A_IP="$(resolve_ip "$DOMAIN" || true)"
WWW_IP="$(resolve_ip "$WWW" || true)"
echo "DNS ${DOMAIN} -> ${A_IP:-?} | ${WWW} -> ${WWW_IP:-?}"

if [[ "$A_IP" == "$VPS_IP" && "$WWW_IP" == "$VPS_IP" ]]; then
  sudo certbot --nginx -d "$DOMAIN" -d "$WWW" \
    --non-interactive --agree-tos --register-unsafely-without-email --redirect
  echo "SSL listo."
else
  echo "SKIP SSL: el DNS todavía no apunta a ${VPS_IP}."
  echo "Cuando Hostinger resuelva, volvé a correr este script o:"
  echo "  sudo certbot --nginx -d ${DOMAIN} -d ${WWW} --non-interactive --agree-tos --register-unsafely-without-email --redirect"
fi

echo ""
echo "==> Verificación"
curl -fsS "http://127.0.0.1:3001/health" && echo ""
curl -sI -H "Origin: https://${DOMAIN}" "http://127.0.0.1:3001/health" | grep -i access-control || true
echo ""
echo "Listo. Probá: https://${DOMAIN}  y  https://${DOMAIN}/backend/health"
