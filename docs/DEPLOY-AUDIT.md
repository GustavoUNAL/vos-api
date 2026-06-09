# Auditoría de despliegue — VOS AI

Checklist para publicar **vos-api** + **vos-front** en servidor (VPS/Docker).

## 1. Variables obligatorias (API)

| Variable | Requisito |
|----------|-----------|
| `DATABASE_URL` | Postgres con SSL (`?sslmode=require` en Neon) |
| `JWT_SECRET` | ≥ 32 caracteres, valor aleatorio |
| `CORS_ORIGIN` | URL(s) del front, separadas por coma (sin barra final) |
| `NODE_ENV` | `production` |

## 2. Variables recomendadas (API)

| Variable | Uso |
|----------|-----|
| `OPENAI_API_KEY` | Asistente de negocio + bot landing (`POST /public/landing/ask`) |
| `OPENAI_CHAT_MODEL` | Ej. `gpt-4o` |
| `HTTP_BODY_LIMIT` | `12mb` (comprobantes POS en base64) |
| `TELEGRAM_BOT_TOKEN` | Notificaciones y bot Telegram (opcional) |
| `TELEGRAM_ADMIN_CHAT_ID` | Chat admin Telegram |
| `TELEGRAM_BOT_ENABLED` | `true` / `false` |
| `LISTEN_HOST` | `0.0.0.0` en Docker |

## 3. Build del front (Vite)

Definir en **build time** (Docker `args` o `.env.production`):

| Variable | Requisito |
|----------|-----------|
| `VITE_API_URL` | URL **pública** del API (ej. `https://api.tudominio.com`) |
| `VITE_LANDING_WHATSAPP_URL` | Enlace wa.me completo (no se muestra el número en UI) |
| `VITE_PLATFORM_MODE` | `true` para multi-empresa |

> Si cambiás `VITE_*`, hay que **reconstruir** la imagen del front.

## 4. Comandos de despliegue (VPS)

```bash
# En vos-api, con .env configurado:
docker compose -f docker-compose.vps.yml --profile full up -d --build

# Migraciones (si RUN_MIGRATIONS_ON_START=false):
docker compose -f docker-compose.vps.yml run --rm api npx prisma migrate deploy
```

## 5. Verificación post-deploy

```bash
curl -sS https://TU_API/health
# → {"status":"ok",...}

curl -sS -X POST https://TU_API/public/landing/ask \
  -H 'Content-Type: application/json' \
  -d '{"question":"¿Qué es VOS AI?"}'
# → {"answer":"...", "advisorSuggested":false}
```

Desde el navegador:

- [ ] Landing carga sin errores en consola
- [ ] Bot VOS AI responde (requiere `OPENAI_API_KEY`)
- [ ] Login y dashboard con JWT
- [ ] POS: crear venta con foto de comprobante (sin 413)
- [ ] CORS: front y API en dominios configurados en `CORS_ORIGIN`

## 6. Seguridad

- [ ] `.env` **no** commiteado
- [ ] `JWT_SECRET` distinto al de desarrollo
- [ ] HTTPS en producción (reverse proxy: nginx/Caddy)
- [ ] `VITE_LANDING_WHATSAPP_URL` solo en build; número no hardcodeado en repo
- [ ] Rotar claves si estuvieron en chat o logs

## 7. Puertos típicos

| Servicio | Puerto |
|----------|--------|
| API | 3000 (`API_SERVER_PORT`) |
| Front (nginx) | 8080 (`FRONT_SERVER_PORT`) |

## 8. Problemas frecuentes

| Síntoma | Causa probable |
|---------|----------------|
| `PayloadTooLargeError` en ventas | Falta `HTTP_BODY_LIMIT=12mb` o API sin reiniciar |
| Bot landing sin respuesta IA | `OPENAI_API_KEY` vacía o CORS bloqueando `POST /public/landing/ask` |
| Front no conecta API | `VITE_API_URL` incorrecta en build |
| 401 en rutas públicas | Usar `auth: false`; landing usa `/public/landing/ask` |
| CORS error | Agregar origen exacto del front en `CORS_ORIGIN` |

## 9. CI

- `vos-api`: `.github/workflows/ci.yml` — build + tests
- `vos-front`: `.github/workflows/ci.yml` — `tsc` + `vite build`

Ejecutar CI en verde antes de desplegar.
