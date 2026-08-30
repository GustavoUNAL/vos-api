#!/usr/bin/env bash
# Repara HTTPS de vos-ia.com SIN tocar arandano-app, .env ni la base.
#
# Por qué fallaba: `certbot --nginx` agrega vos-ia.com al vhost SSL por defecto
# (arandanocafe.com → Next.js :3000). El navegador pide https://vos-ia.com y
# Nginx lo manda al café.
#
# Este script:
#   1) saca vos-ia.com de los otros vhosts
#   2) deja HTTP sirviendo VOS IA (:5174) para el desafío ACME
#   3) emite/renueva el cert con webroot (no modifica Nginx del café)
#   4) instala el vhost HTTPS propio
set -euo pipefail

DOMAIN="vos-ia.com"
WWW="www.vos-ia.com"
API_DIR="${API_DIR:-$HOME/projects/vos-ai/vos-api}"
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}"
SSL_EXAMPLE="$API_DIR/deploy/nginx-vos-ia.ssl.conf.example"
HTTP_EXAMPLE="$API_DIR/deploy/nginx-vos-ia.conf.example"
DETACH_PY="$API_DIR/scripts/nginx-detach-vos-ia-names.py"
WEBROOT="/var/www/certbot"
CERT_LIVE="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
STAMP="$(date +%Y%m%d-%H%M%S)"

log() { echo "==> $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

title_of() {
  curl -ksS --max-time 15 "$@" | grep -oE '<title>[^<]+</title>' | head -1 || true
}

nginx_test_reload() {
  local err
  set +e
  err="$(sudo nginx -t 2>&1)"
  local ok=$?
  set -e
  if [[ "$ok" -ne 0 ]]; then
    if echo "$err" | grep -qi http2 && sudo grep -q 'ssl http2' "$NGINX_SITE"; then
      log "Nginx no acepta listen http2; se deja solo ssl"
      sudo sed -i 's/ ssl http2;/ ssl;/g' "$NGINX_SITE"
      sudo nginx -t
    else
      echo "$err" >&2
      die "nginx -t falló"
    fi
  fi
  sudo systemctl reload nginx
}

[[ -f "$HTTP_EXAMPLE" ]] || die "Falta $HTTP_EXAMPLE — git pull en vos-api"
[[ -f "$SSL_EXAMPLE" ]] || die "Falta $SSL_EXAMPLE — git pull en vos-api"
[[ -f "$DETACH_PY" ]] || die "Falta $DETACH_PY — git pull en vos-api"

log "Comprobar que VOS IA está arriba en este VPS (no el café)"
curl -fsS --max-time 5 "http://127.0.0.1:3001/health" >/dev/null || die "vos-api no responde en :3001"
curl -fsS --max-time 5 -o /dev/null "http://127.0.0.1:5174/" || die "vos-front no responde en :5174"

log "Backup de Nginx"
sudo mkdir -p /etc/nginx/sites-available /var/backups/nginx-vos-ia
sudo tar -czf "/var/backups/nginx-vos-ia/sites-${STAMP}.tgz" \
  /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null || true
if [[ -f "$NGINX_SITE" ]]; then
  sudo cp -a "$NGINX_SITE" "${NGINX_SITE}.bak-${STAMP}"
fi

log "Sacar ${DOMAIN} de vhosts ajenos (arandanocafe y lo que Certbot haya mezclado)"
sudo python3 "$DETACH_PY"
sudo rm -f "/etc/nginx/sites-enabled/vos-ai.arandano.shop"

log "Webroot ACME + vhost HTTP de VOS IA (sin redirect al café)"
sudo mkdir -p "$WEBROOT"
sudo chown -R www-data:www-data "$WEBROOT" 2>/dev/null || sudo chmod 755 "$WEBROOT"
echo ok | sudo tee "${WEBROOT}/health.txt" >/dev/null
sudo cp "$HTTP_EXAMPLE" "$NGINX_SITE"
sudo ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/${DOMAIN}"
nginx_test_reload

HTTP_TITLE="$(title_of --resolve "${DOMAIN}:80:127.0.0.1" "http://${DOMAIN}/")"
log "HTTP local Host ${DOMAIN}: ${HTTP_TITLE:-<sin title>}"
if echo "$HTTP_TITLE" | grep -Eiq 'arándano|arandano|café bar'; then
  die "HTTP de ${DOMAIN} sigue sirviendo Arándano. Revisá sites-enabled y que vos-front (:5174) esté vivo."
fi

log "Certificado Let's Encrypt propio (webroot — no usa el plugin nginx)"
CERTBOT_OK=0
if command -v certbot >/dev/null 2>&1; then
  certbot_webroot() {
    sudo certbot certonly --webroot -w "$WEBROOT" \
      -d "$DOMAIN" -d "$WWW" \
      --cert-name "$DOMAIN" \
      --non-interactive --agree-tos --register-unsafely-without-email \
      --keep-until-expiring --expand \
      --deploy-hook "systemctl reload nginx" \
      "$@"
  }
  if certbot_webroot; then
    CERTBOT_OK=1
  elif [[ ! -f "$CERT_LIVE" ]] && certbot_webroot --duplicate; then
    CERTBOT_OK=1
  else
    echo "WARN: certbot webroot no pudo emitir/renovar. Si ya existe ${CERT_LIVE}, se instala igual." >&2
  fi
else
  echo "WARN: certbot no está instalado." >&2
fi

if [[ ! -f "$CERT_LIVE" ]]; then
  echo ""
  echo "No hay ${CERT_LIVE}. ${DOMAIN} queda en HTTP sirviendo VOS IA (sin mandarte al café)."
  echo "Cuando el DNS A de ${DOMAIN} y ${WWW} apunte a este VPS, volvé a correr:"
  echo "  bash $API_DIR/scripts/fix-vos-ia-https.sh"
  echo ""
  echo "Title HTTP: $HTTP_TITLE"
  exit 0
fi

log "Instalar vhost HTTPS con el cert de ${DOMAIN}"
sudo cp "$SSL_EXAMPLE" "$NGINX_SITE"
nginx_test_reload

echo ""
log "Certificado instalado"
sudo openssl x509 -in "$CERT_LIVE" -noout -subject -dates -ext subjectAltName || true
SAN="$(sudo openssl x509 -in "$CERT_LIVE" -noout -ext subjectAltName 2>/dev/null || true)"
echo "$SAN" | grep -q "$DOMAIN" || die "El certificado no incluye ${DOMAIN} en SAN"
if echo "$SAN" | grep -q arandanocafe; then
  die "El certificado todavía menciona arandanocafe.com — no es el cert de VOS IA"
fi

HTTPS_TITLE="$(title_of --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/")"
log "HTTPS local Host ${DOMAIN}: ${HTTPS_TITLE:-<sin title>}"
if echo "$HTTPS_TITLE" | grep -Eiq 'arándano|arandano|café bar'; then
  die "HTTPS de ${DOMAIN} sigue sirviendo Arándano. Nginx aún está mezclando vhosts."
fi

HTTP_LOC="$(curl -sI --max-time 10 --resolve "${DOMAIN}:80:127.0.0.1" "http://${DOMAIN}/" | tr -d '\r' | awk 'tolower($1)=="location:"{print $2; exit}')"
if echo "$HTTP_LOC" | grep -Eiq 'arandano'; then
  die "HTTP redirige a Arándano ($HTTP_LOC)"
fi

echo ""
echo "Listo. ${DOMAIN} usa su propio certificado y el front en :5174."
echo "Title HTTPS: ${HTTPS_TITLE}"
echo "HTTP Location: ${HTTP_LOC:-<sin redirect todavía, recargá>}"
echo "Probá en el navegador (sin caché): https://${DOMAIN}/"
if [[ "$CERTBOT_OK" -eq 0 ]]; then
  echo "Nota: certbot no renovó ahora; se reutilizó el cert que ya estaba en disco."
fi
