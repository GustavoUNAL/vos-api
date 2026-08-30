#!/usr/bin/env bash
# Emite Let's Encrypt para vos-ia.com y lo carga en Nginx.
# No usa certbot --nginx (mezcla el vhost del café).
set -euo pipefail

DOMAIN="vos-ia.com"
WWW="www.vos-ia.com"
WEBROOT="/var/www/certbot"
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}"
LE_CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
LE_KEY="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"
LE_LOG="/tmp/vos-ia-certbot.log"

log() { echo "==> $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

le_exists() { sudo test -f "$LE_CERT" && sudo test -f "$LE_KEY"; }

apply_le_to_nginx() {
  sudo cp -a "$NGINX_SITE" "${NGINX_SITE}.bak-le-$(date +%Y%m%d-%H%M%S)"
  sudo sed -i \
    -e "s|/etc/nginx/ssl/${DOMAIN}.crt|${LE_CERT}|g" \
    -e "s|/etc/nginx/ssl/${DOMAIN}.key|${LE_KEY}|g" \
    "$NGINX_SITE"
  if ! sudo grep -q "$LE_CERT" "$NGINX_SITE"; then
    sudo sed -i "s|^\\s*ssl_certificate .*|  ssl_certificate     ${LE_CERT};|" "$NGINX_SITE"
    sudo sed -i "s|^\\s*ssl_certificate_key .*|  ssl_certificate_key ${LE_KEY};|" "$NGINX_SITE"
  fi
  sudo grep -n ssl_certificate "$NGINX_SITE"
  sudo nginx -t
  sudo systemctl reload nginx
}

[[ -f "$NGINX_SITE" ]] || die "No está $NGINX_SITE"

if le_exists; then
  issuer="$(sudo openssl x509 -in "$LE_CERT" -noout -issuer || true)"
  if echo "$issuer" | grep -qi "Let's Encrypt\|ISRG"; then
    log "Ya hay un cert Let's Encrypt. Solo se carga en Nginx."
    apply_le_to_nginx
    echo ""
    echo "En disco:  $issuer"
    echo "En 443:"
    echo | openssl s_client -servername "$DOMAIN" -connect "${DOMAIN}:443" 2>/dev/null \
      | openssl x509 -noout -issuer -subject || true
    echo ""
    echo "Recargá https://${DOMAIN}/ — el aviso ERR_CERT_AUTHORITY_INVALID tiene que desaparecer."
    exit 0
  fi
fi

log "Webroot ACME"
sudo mkdir -p "${WEBROOT}/.well-known/acme-challenge"
echo ping | sudo tee "${WEBROOT}/.well-known/acme-challenge/ping" >/dev/null
sudo chmod -R a+rX "$WEBROOT"
acme="$(curl -fsS --max-time 8 "http://${DOMAIN}/.well-known/acme-challenge/ping" || true)"
[[ "$acme" == *ping* ]] || die "ACME HTTP de ${DOMAIN} no responde ping"

if ! command -v certbot >/dev/null 2>&1; then
  log "Instalar certbot"
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y certbot
fi
certbot --version

run_certbot() {
  sudo certbot certonly --webroot -w "$WEBROOT" \
    --cert-name "$DOMAIN" \
    --non-interactive --agree-tos --register-unsafely-without-email \
    --keep-until-expiring --expand \
    --deploy-hook "systemctl reload nginx" \
    "$@"
}

log "Pedir certificado a Let's Encrypt"
set +e
run_certbot -d "$DOMAIN" -d "$WWW" 2>&1 | tee "$LE_LOG"
ok=${PIPESTATUS[0]}
set -e

if [[ "$ok" -ne 0 ]] && ! le_exists; then
  log "Falló apex+www; reintento solo ${DOMAIN}"
  set +e
  run_certbot -d "$DOMAIN" --force-renewal 2>&1 | tee -a "$LE_LOG"
  ok=${PIPESTATUS[0]}
  set -e
fi

if ! le_exists; then
  echo "----- certbot log -----"
  cat "$LE_LOG" || true
  die "Certbot no emitió $LE_CERT. Pegá el log de arriba."
fi

issuer="$(sudo openssl x509 -in "$LE_CERT" -noout -issuer)"
echo "$issuer"
echo "$issuer" | grep -qiE "Let's Encrypt|ISRG" || die "El archivo emitido no es de Let's Encrypt: $issuer"

log "Poner el cert en Nginx"
apply_le_to_nginx

echo ""
echo "En disco:  $issuer"
echo "En 443:"
echo | openssl s_client -servername "$DOMAIN" -connect "${DOMAIN}:443" 2>/dev/null \
  | openssl x509 -noout -issuer -subject || true
echo ""
echo "Recargá https://${DOMAIN}/ — el aviso ERR_CERT_AUTHORITY_INVALID tiene que desaparecer."
