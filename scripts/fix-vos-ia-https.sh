#!/usr/bin/env bash
# Certificado Let's Encrypt PROPIO de vos-ia.com (no el de arandanocafe.com).
# No toca arandano-app, .env ni la base.
set -euo pipefail

DOMAIN="vos-ia.com"
WWW="www.vos-ia.com"
API_DIR="${API_DIR:-$HOME/projects/vos-ai/vos-api}"
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}"
SSL_EXAMPLE="$API_DIR/deploy/nginx-vos-ia.ssl.conf.example"
HTTP_EXAMPLE="$API_DIR/deploy/nginx-vos-ia.conf.example"
STAMP="$(date +%Y%m%d-%H%M%S)"

log() { echo "==> $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

[[ -f "$HTTP_EXAMPLE" ]] || die "Falta $HTTP_EXAMPLE"
[[ -f "$SSL_EXAMPLE" ]] || die "Falta $SSL_EXAMPLE — hacé git pull en vos-api"

log "Backup Nginx"
sudo mkdir -p /etc/nginx/sites-available
if [[ -f "$NGINX_SITE" ]]; then
  sudo cp -a "$NGINX_SITE" "${NGINX_SITE}.bak-${STAMP}"
fi

log "Vhost HTTP temporal para que Certbot valide el dominio"
sudo cp "$HTTP_EXAMPLE" "$NGINX_SITE"
sudo ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/${DOMAIN}"
sudo nginx -t
sudo systemctl reload nginx

log "Emitir certificado SOLO para ${DOMAIN} y ${WWW}"
sudo certbot certonly --nginx -d "$DOMAIN" -d "$WWW" \
  --non-interactive --agree-tos --register-unsafely-without-email \
  --expand --cert-name "$DOMAIN"

[[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]] || die "No se creó /etc/letsencrypt/live/${DOMAIN}/fullchain.pem"

log "Instalar vhost HTTPS con ese certificado"
sudo cp "$SSL_EXAMPLE" "$NGINX_SITE"
sudo nginx -t
sudo systemctl reload nginx

echo ""
echo "Certificado:"
sudo openssl x509 -in "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" -noout -subject -dates -ext subjectAltName
echo ""
echo -n "HTTPS title: "
curl -s --max-time 10 "https://${DOMAIN}/" | grep -oE '<title>[^<]+</title>' | head -1
echo ""
echo "Si el candado sigue en rojo, recargá sin caché. El CN debe ser vos-ia.com, no arandanocafe.com."
