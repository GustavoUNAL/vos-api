#!/usr/bin/env bash
# Emite el certificado Let's Encrypt de vos-ia.com y lo pone en Nginx.
# No usa `certbot --nginx` (eso pegaba el dominio al café).
# No toca arandano-app, :3000, .env ni la base.
#
#   bash ~/projects/vos-ai/vos-api/scripts/issue-vos-ia-letsencrypt.sh
set -euo pipefail

DOMAIN="vos-ia.com"
WWW="www.vos-ia.com"
WEBROOT="/var/www/certbot"
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}"
LE_CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
LE_KEY="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"
TMP_CERT="/etc/nginx/ssl/${DOMAIN}.crt"
TMP_KEY="/etc/nginx/ssl/${DOMAIN}.key"

log() { echo "==> $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

[[ -f "$NGINX_SITE" ]] || die "No está $NGINX_SITE. Primero: bash scripts/fix-vos-ia-https.sh"

log "Comprobar desafío HTTP (Let's Encrypt lo usa)"
sudo mkdir -p "${WEBROOT}/.well-known/acme-challenge"
echo ping | sudo tee "${WEBROOT}/.well-known/acme-challenge/ping" >/dev/null
acme="$(curl -fsS --max-time 8 "http://${DOMAIN}/.well-known/acme-challenge/ping" || true)"
[[ "$acme" == *ping* ]] || die "http://${DOMAIN}/.well-known/acme-challenge/ping no responde. Nginx ACME no está listo."

if ! command -v certbot >/dev/null 2>&1; then
  log "Instalar certbot (sin plugin nginx)"
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y certbot
fi

log "Emitir certificado propio de ${DOMAIN} (webroot)"
sudo certbot certonly --webroot -w "$WEBROOT" \
  -d "$DOMAIN" -d "$WWW" \
  --cert-name "$DOMAIN" \
  --non-interactive --agree-tos --register-unsafely-without-email \
  --keep-until-expiring --expand \
  --deploy-hook "systemctl reload nginx"

[[ -f "$LE_CERT" && -f "$LE_KEY" ]] || die "No se creó $LE_CERT"

SAN="$(sudo openssl x509 -in "$LE_CERT" -noout -ext subjectAltName 2>/dev/null || true)"
echo "$SAN"
echo "$SAN" | grep -q "$DOMAIN" || die "El certificado no incluye ${DOMAIN}"
if echo "$SAN" | grep -q arandanocafe; then
  die "Ese certificado es el del café. Abortando."
fi

log "Apuntar Nginx al cert de Let's Encrypt (sin reescribir el vhost)"
sudo cp -a "$NGINX_SITE" "${NGINX_SITE}.bak-le-$(date +%Y%m%d-%H%M%S)"
sudo sed -i \
  -e "s|${TMP_CERT}|${LE_CERT}|g" \
  -e "s|${TMP_KEY}|${LE_KEY}|g" \
  -e "s|/etc/nginx/ssl/${DOMAIN}.crt|${LE_CERT}|g" \
  -e "s|/etc/nginx/ssl/${DOMAIN}.key|${LE_KEY}|g" \
  "$NGINX_SITE"

if ! sudo grep -q "$LE_CERT" "$NGINX_SITE"; then
  die "Nginx no quedó con $LE_CERT. Revisá $NGINX_SITE"
fi

sudo nginx -t
sudo systemctl reload nginx

echo ""
echo "Certificado:"
sudo openssl x509 -in "$LE_CERT" -noout -issuer -subject -dates
echo ""
echo "Público:"
echo | openssl s_client -servername "$DOMAIN" -connect "${DOMAIN}:443" 2>/dev/null \
  | openssl x509 -noout -issuer -subject || true
echo ""
echo "Listo. Recargá https://${DOMAIN}/ — el emisor tiene que ser Let's Encrypt, no CN=${DOMAIN}."
echo "Renovación: certbot.timer (ya recarga Nginx con --deploy-hook)."
