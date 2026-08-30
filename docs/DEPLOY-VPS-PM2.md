# Despliegue VPS con PM2 — VOS IA

Stack en el servidor **51.222.24.228**:

| Servicio | PM2 | Puerto | Variables |
|----------|-----|--------|-----------|
| Next.js arándano | `arandano` | **3000** | No tocar |
| **vos-api** (NestJS) | `vos-api` | **3001** | `vos-api/.env` |
| **vos-front** (Vite preview) | `vos-front` | **5174** | `vos-front/.env` |
| Nginx | sistema | 80/443 | **vos-ia.com** |

## Convención de archivos `.env`

| Entorno | API | Front |
|---------|-----|-------|
| **Local (Mac)** | `.env.local` | `.env.local` |
| **Producción (VPS)** | `.env` | `.env` |
| **Staging** | `.env.dev` + `VOS_ENV=dev` | `.env.dev` + `npm run build:dev` |

Plantillas commiteadas: `.env.local.example`, `.env.production.example`, `.env.dev.example`.

⚠️ **Nunca** dejes `.env.local` en el VPS: pisa CORS, PORT y `VITE_API_URL`.

## 0. Dominio en Hostinger (vos-ia.com)

El sitio **no** se hospeda en Hostinger: Hostinger solo gestiona el DNS. La app corre en el VPS.

En hPanel → **Dominios** → `vos-ia.com` → **DNS / Zona DNS**:

| Tipo | Nombre | Apunta a | TTL |
|------|--------|----------|-----|
| **A** | `@` | `51.222.24.228` | 300 |
| **A** | `www` | `51.222.24.228` | 300 |

- Borrá registros **A** o **AAAA** que apunten a IPs de Hostinger (parking / web).
- Si existe un **CNAME** de `www`, reemplazalo por el **A** de arriba.
- **No toques MX/TXT** si usás correo de Hostinger.
- Desconectá el “sitio web” de Hostinger para este dominio (si está activo pisa el DNS).

Comprobar desde tu Mac (puede tardar minutos):

```bash
dig +short vos-ia.com A
dig +short www.vos-ia.com A
```

Tiene que salir `51.222.24.228`. Recién entonces pedí el certificado SSL.

## 1. API (`vos-api`)

```bash
cd ~/projects/vos-ai/vos-api
git pull origin main
cp .env.production.example .env   # solo la primera vez
nano .env                         # DATABASE_URL, JWT_SECRET, CORS_ORIGIN, OPENAI_API_KEY

rm -f .env.local
./scripts/deploy-pm2-vps.sh
```

`CORS_ORIGIN` en producción:

```text
https://vos-ia.com,https://www.vos-ia.com,https://vos-ai.arandano.shop
```

Tras el deploy (si hace falta reasegurar owners multi-empresa en Neon):

```bash
npm run db:create-gustavo-user
```

Comprobar CORS:

```bash
curl -sI -H "Origin: https://vos-ia.com" http://127.0.0.1:3001/health | grep -i access-control
```

## Checklist post-deploy

- [ ] `https://vos-ia.com/backend/health` → OK
- [ ] Login clínica `https://vos-ia.com/#/health/login`
- [ ] Login negocio `https://vos-ia.com/#/login`
- [ ] `www.vos-ia.com` redirige a `vos-ia.com`
- [ ] En un teléfono (Chrome Android / Galaxy): landing scrollea, login no hace zoom al escribir, menú y botones se tocan bien
- [ ] `https://vos-ia.com/manifest.webmanifest` responde JSON (añadir a inicio en Samsung)

## Teléfono (Samsung Galaxy A56)

Chrome Android cachea el `index.html` si Nginx no manda `Cache-Control: no-cache`.
Después de cada deploy, si el teléfono sigue viendo la versión vieja: en Chrome → menú → **Borrar datos de sitios** para `vos-ia.com`, o recargar sin caché.

Para instalar como app: Chrome → menú → **Agregar a la pantalla de inicio**.

## 2. Front (`vos-front`)

```bash
cd ~/projects/vos-ai/vos-front
git pull origin main
cp .env.production.example .env   # solo la primera vez
nano .env                         # VITE_API_URL=https://vos-ia.com/backend

rm -f .env.local
npm ci && npm run build
pm2 restart vos-front --update-env
```

Verificar que el build embebe HTTPS:

```bash
grep -o 'https://vos-ia.com/backend\|http://51.222.24.228:3001' dist/assets/index-*.js | sort -u
```

## 3. Nginx + HTTPS (vos-ia.com)

```bash
cd ~/projects/vos-ai/vos-api
git pull origin main
bash scripts/fix-vos-ia-https.sh
```

No uses `certbot --nginx`: ese plugin mete `vos-ia.com` en el vhost de `arandanocafe.com` y HTTPS abre el café. El script emite el cert con **webroot**, saca el dominio de los otros sites y deja un vhost SSL propio.

## Variables clave (producción)

| Variable | Dónde | Valor |
|----------|-------|-------|
| `NODE_ENV` | vos-api `.env` | `production` |
| `PORT` | vos-api `.env` | `3001` |
| `CORS_ORIGIN` | vos-api `.env` | `https://vos-ia.com,https://www.vos-ia.com` |
| `VITE_API_URL` | vos-front `.env` | `https://vos-ia.com/backend` |
| `VITE_APP_URL` | vos-front `.env` | `https://vos-ia.com` |
| `DATABASE_URL` | vos-api `.env` | Neon con `?sslmode=require` |

## Problemas frecuentes

| Síntoma | Causa | Solución |
|---------|-------|----------|
| Mixed Content | `VITE_API_URL` en `http://` con front en `https://` | `.env` front → `https://vos-ia.com/backend` + `npm run build` |
| CORS sin `Allow-Origin` | `.env.local` en vos-api o `NODE_ENV=development` | `rm .env.local`, `NODE_ENV=production`, `--update-env` |
| Front viejo | Build sin recompilar | `npm run build` + `pm2 restart vos-front --update-env` |
| API devuelve HTML Next.js | Curl a `:3000` | API está en `:3001` |
| Certbot: NXDOMAIN | DNS aún no apunta al VPS | Esperá el A record y reintentá |
| Vite 403 Host | `allowedHosts` sin vos-ia.com | `git pull` front + restart `vos-front` |
| HTTPS abre Arándano Café / candado rojo | `certbot --nginx` pegó vos-ia.com al vhost del café | `bash scripts/fix-vos-ia-https.sh` (nunca `certbot --nginx`) |
