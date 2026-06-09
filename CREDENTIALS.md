# Credenciales VOS AI — copiá estos valores en local Y en el servidor

Usá **exactamente los mismos** en `.env.local` (Mac) y `.env.dev` (VPS) para que el login no cambie al desplegar.

## 1. Administrador de plataforma (solo vos)

Panel en `#/platform` — gestionás empresas, usuarios y solicitudes.

| Variable | Valor por defecto |
|----------|-------------------|
| `SEED_ADMIN_EMAIL` | `admin@vos.ai` |
| `SEED_ADMIN_PASSWORD` | `VosAi2026!` |
| `SEED_ADMIN_NAME` | `Administrador VOS AI` |

Front (pre-rellena login):

| Variable | Valor |
|----------|-------|
| `VITE_PRESET_LOGIN_EMAIL` | `admin@vos.ai` |
| `VITE_PRESET_LOGIN_PASSWORD` | `VosAi2026!` |

## 2. Arándano Café Bar (tenant operativo)

Panel en `#/e/arandano/…` — productos, ventas, POS, tienda, etc.

| Variable | Valor por defecto |
|----------|-------------------|
| `SEED_ARANDANO_EMAIL` | `owner@arandano.com` |
| `SEED_ARANDANO_PASSWORD` | `Arandano2026!` |
| `SEED_ARANDANO_NAME` | `Propietario Arándano` |

Empresa: **Arándano Café Bar** · slug `arandano` · tienda `#/tienda/arandano`

## JWT (obligatorio igual en servidor)

| Variable | Ejemplo |
|----------|---------|
| `JWT_SECRET` | `local-docker-vos-ai-jwt-secret-min-32-chars` |

## Notificaciones solicitudes

| Variable | Valor |
|----------|-------|
| `ADMIN_NOTIFY_EMAIL` | tu email donde revisás solicitudes |

## Después de desplegar

```bash
cd vos.ai-api
npm run db:migrate
npm run db:seed-platform
```

## Ver solicitudes pendientes

```sql
SELECT * FROM access_requests WHERE status = 'PENDING' ORDER BY created_at DESC;
```
