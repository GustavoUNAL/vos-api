# Despliegue VPS con PM2 — VOS AI

Stack en el servidor **51.222.24.228** (Arándano):

| Servicio | PM2 | Puerto | Notas |
|----------|-----|--------|-------|
| Next.js arándano | `arandano` | **3000** | No tocar |
| **vos-api** (NestJS) | `vos-api` | **3001** | `.env` en vos-api |
| **vos-front** (Vite) | `vos-front` | **5174** | `.env.local` en vos-front |
| Nginx | sistema | 80/443 | `vos-ai.arandano.shop` |

## 1. API (`vos-api`)

```bash
cd ~/projects/vos-ai/vos-api
git pull origin main
cp .env.vps.example .env
nano .env   # DATABASE_URL, JWT_SECRET, OPENAI_API_KEY

# ⚠️ Crítico: no dejar .env.local en el VPS (pisaba CORS)
rm -f .env.local

./scripts/deploy-pm2-vps.sh
```

Comprobar CORS:

```bash
curl -sI -H "Origin: http://51.222.24.228:5174" http://127.0.0.1:3001/health | grep -i access-control
# Debe incluir: Access-Control-Allow-Origin: http://51.222.24.228:5174
```

## 2. Front (`vos-front`)

```bash
cd ~/projects/vos-ai/vos-front
git pull origin main
git reset --hard origin/main
cp .env.vps.example .env.local
nano .env.local   # VITE_API_URL según tu caso
npm ci
pm2 restart vos-front
```

## 3. Nginx + HTTPS (dominio)

```bash
cd ~/projects/vos-ai/vos-api
sudo cp deploy/nginx-vos-ai.conf.example /etc/nginx/sites-available/vos-ai.arandano.shop
sudo ln -sf /etc/nginx/sites-available/vos-ai.arandano.shop /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d vos-ai.arandano.shop
```

Con Nginx activo, en `vos-front/.env.local` usá:

```env
VITE_API_URL=https://vos-ai.arandano.shop/backend
VITE_APP_URL=https://vos-ai.arandano.shop
```

Y en `vos-api/.env`:

```env
CORS_ORIGIN=https://vos-ai.arandano.shop,http://51.222.24.228:5174
```

Luego `pm2 restart vos-api vos-front`.

## Variables clave

| Variable | Dónde | Valor en tu VPS |
|----------|-------|-----------------|
| `PORT` | vos-api `.env` | `3001` |
| `CORS_ORIGIN` | vos-api `.env` | `http://51.222.24.228:5174,https://vos-ai.arandano.shop` |
| `VITE_API_URL` | vos-front `.env.local` | `http://51.222.24.228:3001` o `https://vos-ai.arandano.shop/backend` |
| `DATABASE_URL` | vos-api `.env` | Neon con `?sslmode=require` |

## Problemas frecuentes

| Síntoma | Causa | Solución |
|---------|-------|----------|
| CORS sin `Allow-Origin` | `.env.local` en vos-api sin CORS | `rm vos-api/.env.local`, usar solo `.env` |
| API devuelve HTML Next.js | Curl a `:3000` | API está en `:3001` |
| Front viejo | `git pull` sin reset | `git reset --hard origin/main` + `pm2 restart` |
| `allowedHosts` Vite | Dominio nuevo | Ya en `vite.config.ts` |
