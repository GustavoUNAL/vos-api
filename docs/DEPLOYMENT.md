# Despliegue — vos.ai (VPS + Neon)

## Arquitectura recomendada

| Componente | Dónde corre |
|------------|-------------|
| **PostgreSQL** | [Neon](https://neon.tech) (rama `production`) |
| **API** | VPS — contenedor Docker o Node |
| **Front** | VPS — contenedor Nginx (build Vite) |

## Variables obligatorias (`vos.ai-api/.env`)

| Variable | Ejemplo |
|----------|---------|
| `DATABASE_URL` | `postgresql://...@ep-xxx.neon.tech/neondb?sslmode=require` |
| `JWT_SECRET` | `openssl rand -base64 48` (≥32 caracteres) |
| `CORS_ORIGIN` | `http://203.0.113.10:8080` o `https://app.tudominio.com` |
| `VITE_API_URL` | URL que el **navegador** usa para el API: `http://203.0.113.10:3000` |

Plantilla: `.env.vps.example` en la raíz del monorepo (copiar a `vos.ai-api/.env`).

## Orden de despliegue

```bash
# 1. Migraciones + seed (una vez, desde PC o VPS con acceso a Neon)
cd vos.ai-api
npm install
npm run db:migrate
npm run db:seed-platform

# 2. Contenedores en el VPS
docker compose -f docker-compose.vps.yml --profile full up -d --build

# 3. Verificar
curl -s http://127.0.0.1:3000/health
# {"status":"ok","database":"up"}
```

## Docker Compose en VPS

Archivo: **`docker-compose.vps.yml`**

- **API** — puerto `API_SERVER_PORT` (default 3000)
- **Front** — perfil `full`, puerto `FRONT_SERVER_PORT` (default 8080)
- `RUN_MIGRATIONS_ON_START=true` aplica migraciones al arrancar (una réplica)

Sin Docker (solo API):

```bash
npm ci && npm run build
NODE_ENV=production npm run start:prod
```

## Desarrollo local

```bash
# vos.ai-api/.env → DATABASE_URL de Neon
npm run start:dev          # :3000

# vos.ai-front (otra terminal)
npm run dev                # :5173, proxy /dev-api
```

## Seguridad

- Rotá credenciales de Neon si se filtraron.
- `JWT_SECRET` único por entorno.
- `CORS_ORIGIN` solo con dominios/orígenes conocidos.
- HTTPS en producción (Caddy/nginx delante).

## Troubleshooting

| Síntoma | Solución |
|---------|----------|
| `P1001` / DB down | Revisar `DATABASE_URL`, SSL (`sslmode=require`), Neon activo |
| CORS en el navegador | `CORS_ORIGIN` debe coincidir exacto con origen del front |
| Front no llega al API | `VITE_API_URL` debe ser la URL **pública** del API (rebuild front) |
| 403 en `/products` | Login válido + header `X-Company-Id` (el front lo envía automático) |

## Archivos relevantes

| Archivo | Uso |
|---------|-----|
| `docker-compose.vps.yml` | VPS con Neon (API + front) |
| `docker-compose.prod.yml` | Solo API contra Postgres externo |
| `Dockerfile` | Imagen API |
| `prisma/seed-platform.ts` | Datos iniciales (empresa demo, admin, menú) |
| `docs/database/VOS_PLATFORM_DESIGN.md` | Esquema multi-tenant |
