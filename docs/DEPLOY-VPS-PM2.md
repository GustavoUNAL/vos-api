# Despliegue VPS con PM2 — VOS AI

Stack en el servidor **51.222.24.228** (Arándano):

| Servicio | PM2 | Puerto | Variables |
|----------|-----|--------|-----------|
| Next.js arándano | `arandano` | **3000** | No tocar |
| **vos-api** (NestJS) | `vos-api` | **3001** | `vos-api/.env` |
| **vos-front** (Vite preview) | `vos-front` | **5174** | `vos-front/.env` |
| Nginx | sistema | 80/443 | `vos-ai.arandano.shop` |

## Convención de archivos `.env`

| Entorno | API | Front |
|---------|-----|-------|
| **Local (Mac)** | `.env.local` | `.env.local` |
| **Producción (VPS)** | `.env` | `.env` |
| **Staging** | `.env.dev` + `VOS_ENV=dev` | `.env.dev` + `npm run build:dev` |

Plantillas commiteadas: `.env.local.example`, `.env.production.example`, `.env.dev.example`.

⚠️ **Nunca** dejes `.env.local` en el VPS: pisa CORS, PORT y `VITE_API_URL`.

## 1. API (`vos-api`)

```bash
cd ~/projects/vos-ai/vos-api
git pull origin main
cp .env.production.example .env   # solo la primera vez
nano .env                         # DATABASE_URL, JWT_SECRET, OPENAI_API_KEY

rm -f .env.local
./scripts/deploy-pm2-vps.sh
```

Tras el deploy (si hace falta reasegurar owners multi-empresa en Neon):

```bash
npm run db:create-gustavo-user
```

Eso deja `owner@arandano.com` y Gustavo como owner de:
**Arándano Café Bar**, **El electricista** y **Main**.

La migración `operating_expenses` (agua/energía/internet) corre con `npm run db:migrate` dentro del script.

Comprobar CORS:

```bash
curl -sI -H "Origin: https://vos-ai.arandano.shop" http://127.0.0.1:3001/health | grep -i access-control
```

## Checklist post-deploy

- [ ] `https://vos-ai.arandano.shop/backend/health` → OK
- [ ] Login `owner@arandano.com` → selector de 3 empresas
- [ ] Cambiar empresa desde header / menú móvil
- [ ] Análisis financiero abre en móvil (KPIs, servicios, cards)
- [ ] David (`david@arandano.com`) **no** ve selector multi-empresa

## 2. Front (`vos-front`)

```bash
cd ~/projects/vos-ai/vos-front
git pull origin main
cp .env.production.example .env   # solo la primera vez
nano .env                         # VITE_API_URL=https://vos-ai.arandano.shop/backend

rm -f .env.local
npm ci && npm run build
pm2 restart vos-front --update-env
```

Verificar que el build embebe HTTPS:

```bash
grep -o 'https://vos-ai.arandano.shop/backend\|http://51.222.24.228:3001' dist/assets/index-*.js | sort -u
```

## 3. Nginx + HTTPS (dominio)

```bash
cd ~/projects/vos-ai/vos-api
sudo cp deploy/nginx-vos-ai.conf.example /etc/nginx/sites-available/vos-ai.arandano.shop
sudo ln -sf /etc/nginx/sites-available/vos-ai.arandano.shop /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d vos-ai.arandano.shop
```

## Variables clave (producción)

| Variable | Dónde | Valor |
|----------|-------|-------|
| `NODE_ENV` | vos-api `.env` | `production` |
| `PORT` | vos-api `.env` | `3001` |
| `CORS_ORIGIN` | vos-api `.env` | `https://vos-ai.arandano.shop` |
| `VITE_API_URL` | vos-front `.env` | `https://vos-ai.arandano.shop/backend` |
| `DATABASE_URL` | vos-api `.env` | Neon con `?sslmode=require` |

## Problemas frecuentes

| Síntoma | Causa | Solución |
|---------|-------|----------|
| Mixed Content | `VITE_API_URL` en `http://` con front en `https://` | `.env` front → `https://.../backend` + `npm run build` |
| CORS sin `Allow-Origin` | `.env.local` en vos-api o `NODE_ENV=development` | `rm .env.local`, `NODE_ENV=production`, `--update-env` |
| Front viejo | Build sin recompilar | `npm run build` + `pm2 restart vos-front --update-env` |
| API devuelve HTML Next.js | Curl a `:3000` | API está en `:3001` |
