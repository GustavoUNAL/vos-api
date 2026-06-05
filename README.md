# vos-api — VOS AI Platform API

API NestJS + Prisma + PostgreSQL (Neon). Multi-empresa con módulo **Productos** activo.

## Inicio rápido

```bash
cp .env.example .env    # DATABASE_URL de Neon
npm install
npm run db:migrate
npm run db:seed-platform
npm run start:dev       # http://localhost:3000
```

**Demo:** `admin@arandano.com` / `Arandano2026!` → **Arándano Café Bar**

## Scripts principales

| Comando | Descripción |
|---------|-------------|
| `npm run start:dev` | API desarrollo |
| `npm run build` | Compilar producción |
| `npm run start:prod` | Ejecutar `dist/` |
| `npm run db:migrate` | `prisma migrate deploy` |
| `npm run db:seed-platform` | Empresa, admin, categorías, productos demo |
| `npm run db:studio` | Prisma Studio |

## Rutas API (plataforma v2)

| Método | Ruta | Auth |
|--------|------|------|
| `POST` | `/auth/login` | No |
| `GET` | `/auth/me` | JWT |
| `POST` | `/auth/switch-company` | JWT |
| `GET` | `/products` | JWT + `X-Company-Id` |
| `POST/PATCH/DELETE` | `/products` | JWT + permisos RBAC |
| `GET` | `/categories` | JWT + tenant |
| `GET` | `/navigation` | No |
| `GET` | `/health` | No |

## VPS

```bash
docker compose -f docker-compose.vps.yml --profile full up -d --build
```

Ver [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) y `../.env.vps.example`.

## Esquema

- Activo: `prisma/schema.prisma` (multi-tenant)
- Legacy: `prisma/schema.legacy.prisma` (referencia v1)
- Diseño: [../docs/database/VOS_PLATFORM_DESIGN.md](../docs/database/VOS_PLATFORM_DESIGN.md)
