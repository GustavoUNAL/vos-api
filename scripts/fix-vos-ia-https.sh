#!/usr/bin/env bash
# Deja https://vos-ia.com en VOS IA (:5174), no en Arándano Café (:3000).
# No toca arandano-app, .env ni la base.
#
# Estado real del VPS: HTTP ya es VOS IA; HTTPS usa el vhost/cert del café
# porque no hay server 443 para vos-ia.com. Este script INSTALA ese 443
# ya, con cert temporal si Let's Encrypt aún no emitió.
set -euo pipefail

DOMAIN="vos-ia.com"
WWW="www.vos-ia.com"
API_DIR="${API_DIR:-$HOME/projects/vos-ai/vos-api}"
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}"
HTTP_EXAMPLE="$API_DIR/deploy/nginx-vos-ia.conf.example"
SSL_443_EXAMPLE="$API_DIR/deploy/nginx-vos-ia.443.conf.example"
DETACH_PY="$API_DIR/scripts/nginx-detach-vos-ia-names.py"
WEBROOT="/var/www/certbot"
LE_CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
LE_KEY="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"
TMP_CERT="/etc/nginx/ssl/${DOMAIN}.crt"
TMP_KEY="/etc/nginx/ssl/${DOMAIN}.key"
STAMP="$(date +%Y%m%d-%H%M%S)"

log() { echo "==> $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

# live/ de Let's Encrypt es 700 root: [[ -f ]] falla y el deploy pone el cert temporal.
le_ready() { sudo test -f "$LE_CERT" && sudo test -f "$LE_KEY"; }

title_of() {
  curl -ksS --max-time 15 "$@" | grep -oE '<title>[^<]+</title>' | head -1 || true
}

looks_like_cafe() {
  echo "$1" | grep -Eiq 'arándano|arandano café|café bar|Arándano Café'
}

nginx_test_reload() {
  local err ok
  set +e
  err="$(sudo nginx -t 2>&1)"
  ok=$?
  set -e
  if [[ "$ok" -ne 0 ]]; then
    if echo "$err" | grep -qi http2; then
      log "Ajuste http2 para Nginx 1.26"
      sudo sed -i '/http2 on;/d' "$NGINX_SITE"
      sudo sed -i 's/ ssl http2;/ ssl;/g' "$NGINX_SITE"
      sudo nginx -t
    else
      echo "$err" >&2
      die "nginx -t falló"
    fi
  fi
  sudo systemctl reload nginx
}

write_site() {
  local cert="$1" key="$2"
  [[ -f "$HTTP_EXAMPLE" && -f "$SSL_443_EXAMPLE" ]] || die "Faltan templates Nginx — git pull"
  sudo test -f "$cert" && sudo test -f "$key" || die "No está el certificado $cert"
  {
    cat "$HTTP_EXAMPLE"
    echo
    sed \
      -e "s|__SSL_CERTIFICATE__|${cert}|g" \
      -e "s|__SSL_CERTIFICATE_KEY__|${key}|g" \
      "$SSL_443_EXAMPLE"
  } | sudo tee "$NGINX_SITE" >/dev/null
  sudo ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/${DOMAIN}"
}

ensure_self_signed() {
  sudo mkdir -p /etc/nginx/ssl
  if [[ -f "$TMP_CERT" && -f "$TMP_KEY" ]]; then
    return 0
  fi
  log "Certificado temporal de ${DOMAIN} (hasta Let's Encrypt)"
  if ! sudo openssl req -x509 -nodes -newkey rsa:2048 -days 30 \
    -keyout "$TMP_KEY" -out "$TMP_CERT" \
    -subj "/CN=${DOMAIN}" \
    -addext "subjectAltName=DNS:${DOMAIN},DNS:${WWW}"
  then
    sudo openssl req -x509 -nodes -newkey rsa:2048 -days 30 \
      -keyout "$TMP_KEY" -out "$TMP_CERT" \
      -subj "/CN=${DOMAIN}"
  fi
}

[[ -f "$HTTP_EXAMPLE" ]] || die "Falta $HTTP_EXAMPLE — git pull en vos-api"
[[ -f "$SSL_443_EXAMPLE" ]] || die "Falta $SSL_443_EXAMPLE — git pull en vos-api"
[[ -f "$DETACH_PY" ]] || die "Falta $DETACH_PY — git pull en vos-api"

log "Comprobar VOS IA en este VPS"
curl -fsS --max-time 5 "http://127.0.0.1:3001/health" >/dev/null || die "vos-api no responde en :3001"
curl -fsS --max-time 5 -o /dev/null "http://127.0.0.1:5174/" || die "vos-front no responde en :5174"
local_front="$(title_of http://127.0.0.1:5174/)"
log "Front :5174 ${local_front:-<sin title>}"
if looks_like_cafe "$local_front"; then
  die "El proceso :5174 no es VOS IA. No se toca Nginx."
fi

log "Backup Nginx"
sudo mkdir -p /var/backups/nginx-vos-ia
sudo tar -czf "/var/backups/nginx-vos-ia/sites-${STAMP}.tgz" \
  /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null || true
if [[ -f "$NGINX_SITE" ]]; then
  sudo cp -a "$NGINX_SITE" "${NGINX_SITE}.bak-${STAMP}"
fi

log "Sacar ${DOMAIN} de vhosts ajenos"
sudo python3 "$DETACH_PY"
sudo rm -f "/etc/nginx/sites-enabled/vos-ai.arandano.shop"

log "Webroot ACME"
sudo mkdir -p "${WEBROOT}/.well-known/acme-challenge"
echo ping | sudo tee "${WEBROOT}/.well-known/acme-challenge/ping" >/dev/null
sudo chown -R www-data:www-data "$WEBROOT" 2>/dev/null || sudo chmod -R a+rX "$WEBROOT"

if le_ready; then
  CERT="$LE_CERT"
  KEY="$LE_KEY"
  log "Usando Let's Encrypt ya emitido"
else
  ensure_self_signed
  CERT="$TMP_CERT"
  KEY="$TMP_KEY"
fi

log "Instalar HTTP + HTTPS de VOS IA (nunca :3000)"
write_site "$CERT" "$KEY"
nginx_test_reload

acme="$(curl -sS --max-time 8 --resolve "${DOMAIN}:80:127.0.0.1" "http://${DOMAIN}/.well-known/acme-challenge/ping" || true)"
log "ACME ping: ${acme:-<vacío>}"

HTTP_TITLE="$(title_of --resolve "${DOMAIN}:80:127.0.0.1" "http://${DOMAIN}/")"
HTTPS_TITLE="$(title_of --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/")"
log "HTTP  ${HTTP_TITLE:-<sin title>}"
log "HTTPS ${HTTPS_TITLE:-<sin title>}"
if looks_like_cafe "$HTTPS_TITLE"; then
  echo "=== server_name que aún mencionan vos-ia.com ==="
  sudo grep -RIn --exclude='*.bak*' --exclude='*~' 'vos-ia.com' /etc/nginx/sites-enabled /etc/nginx/sites-available /etc/nginx/conf.d || true
  die "HTTPS sigue en el café. Pegá la salida de: sudo nginx -T 2>/dev/null | grep -nE 'server_name|listen .*443|ssl_certificate'"
fi

log "Let's Encrypt (webroot). Si falla, HTTPS ya es VOS IA con cert temporal."
CERTBOT_OK=0
if command -v certbot >/dev/null 2>&1; then
  if sudo certbot certonly --webroot -w "$WEBROOT" \
    -d "$DOMAIN" -d "$WWW" \
    --cert-name "$DOMAIN" \
    --non-interactive --agree-tos --register-unsafely-without-email \
    --keep-until-expiring --expand \
    --deploy-hook "systemctl reload nginx"
  then
    CERTBOT_OK=1
  elif ! le_ready; then
    sudo certbot certonly --webroot -w "$WEBROOT" \
      -d "$DOMAIN" -d "$WWW" \
      --cert-name "$DOMAIN" \
      --non-interactive --agree-tos --register-unsafely-without-email \
      --duplicate \
      --deploy-hook "systemctl reload nginx" && CERTBOT_OK=1 || true
  fi
else
  echo "WARN: certbot no está instalado (sudo apt-get install -y certbot)" >&2
fi

if le_ready; then
  log "Pasar Nginx al certificado Let's Encrypt"
  write_site "$LE_CERT" "$LE_KEY"
  nginx_test_reload
  SAN="$(sudo openssl x509 -in "$LE_CERT" -noout -ext subjectAltName 2>/dev/null || true)"
  echo "$SAN"
  echo "$SAN" | grep -q "$DOMAIN" || die "El cert LE no incluye ${DOMAIN}"
  if echo "$SAN" | grep -q arandanocafe; then
    die "El cert LE menciona arandanocafe.com"
  fi
  HTTPS_TITLE="$(title_of --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/")"
fi

echo ""
echo "HTTP:  ${HTTP_TITLE}"
echo "HTTPS: ${HTTPS_TITLE}"
if looks_like_cafe "$HTTPS_TITLE"; then
  die "HTTPS todavía muestra el café"
fi
echo ""
echo "Listo: https://${DOMAIN}/ tiene que abrir VOS IA, no el café."
if [[ "$CERTBOT_OK" -eq 1 ]] || le_ready; then
  echo "Candado: certificado Let's Encrypt de ${DOMAIN}."
else
  echo "Candado: todavía temporal. Revisá certbot (DNS y puerto 80)."
  echo "Cuando Let's Encrypt funcione, volvé a correr este script."
fi
