# Despliegue en la nube — arandano-api

Guía para publicar el backend (NestJS + Prisma + PostgreSQL) sin perder datos ni romper migraciones.

## Arquitectura esperada

| Componente | Rol |
|------------|-----|
| **API** | Contenedor Docker (`Dockerfile`) o proceso Node (`npm run build` + `npm run start:prod`). |
| **PostgreSQL** | Base gestionada (Railway, Neon, Supabase, RDS, etc.) o Postgres propio en VPS. **No** guardes datos importantes solo dentro del contenedor API. |
| **Front** | Variables `VITE_*` / dominio del SPA; debe coincidir con `CORS_ORIGIN` del API. |

## Variables de entorno (producción)

Definir **siempre** en el panel del proveedor o en el servidor (nunca commitear secretos).

| Variable | Obligatoria | Descripción |
|----------|-------------|-------------|
| `DATABASE_URL` | Sí | URL `postgresql://…` con SSL si el proveedor lo exige (`?sslmode=require` en la cadena si aplica). |
| `JWT_SECRET` | Sí | Cadena larga y aleatoria (no uses el valor de desarrollo). |
| `NODE_ENV` | Recomendado | `production` |
| `PORT` | Opcional | Por defecto `3000`. Muchas plataformas inyectan `PORT`; el API ya usa `process.env.PORT`. |
| `CORS_ORIGIN` | Muy recomendado | Origen(es) del front, separados por coma: `https://app.tudominio.com,https://www.tudominio.com`. Sin esto, en producción CORS puede quedar demasiado permisivo. |
| `JWT_EXPIRES_IN` | Opcional | Ej. `7d`, `12h`. |
| `RUN_MIGRATIONS_ON_START` | Opcional | `true` solo si arrancás **una** réplica y querés aplicar migraciones al subir el contenedor. Con varias instancias, ejecutá migraciones en un paso aparte (release job / CI). |

Plantilla local de referencia: `.env.example`.

## Orden correcto: esquema → datos → tráfico

1. **Crear** el servicio PostgreSQL en la nube y copiar la URL interna o pública según indique el proveedor.
2. **Aplicar migraciones** contra esa URL (ver sección [Migraciones](#migraciones)).
3. **Cargar datos** si hace falta (seed, dump, o scripts de import desde tu máquina contra la URL remota).
4. **Desplegar** la API con `DATABASE_URL` apuntando a esa misma base.
5. Configurar **dominio / HTTPS** del API y **`CORS_ORIGIN`** con la URL real del front.

## Migraciones

Prisma debe ejecutar las carpetas en `prisma/migrations/` contra la base de producción **antes** (o al mismo tiempo que el primer arranque controlado) de recibir tráfico real.

**Opción recomendada (CI / release / una sola vez en VPS):**

```bash
export DATABASE_URL="postgresql://..."   # URL de producción
npx prisma migrate deploy
```

En el repo también existe:

```bash
npm run db:migrate   # equivale a prisma migrate deploy
```

**Opción contenedor (una réplica):**

Al ejecutar el servicio definido en `docker-compose.prod.yml`, podés poner:

```bash
RUN_MIGRATIONS_ON_START=true
```

El script `scripts/docker-entrypoint.sh` ejecutará `prisma migrate deploy` y luego levantará Node. **No** uses esto con varias réplicas escaladas en paralelo (riesgo de condiciones de carrera).

## Datos iniciales después del primer deploy

La imagen Docker **no** incluye `prisma/data/` (JSON/CSV de importación) para mantener la imagen liviana.

- **Seed mínimo** (usuarios/categorías de demo): desde tu PC con la URL de prod:
  ```bash
  DATABASE_URL="postgresql://...prod..." npm run db:seed
  ```
- **Dataset completo del repo** (inventario, lotes, productos CSV): ejecutá en tu máquina (o en un job con el repo clonado y archivos `prisma/data` presentes):
  ```bash
  DATABASE_URL="postgresql://...prod..." npm run db:restore-from-repo-data
  ```
- **Copia desde otra base** (local → nube o nube → local): `npm run db:pg-copy-database` con `DATABASE_URL` y `REMOTE_DATABASE_URL` en `.env` (ver `scripts/pg-copy-database.sh`).
- **Volcado** `.dump`: `pg_restore` contra la URL remota (mismo flujo que `npm run db:restore-backup` pero apuntando al host remoto).

## Opción A — VPS + Docker

1. Instalar Docker y Docker Compose en el servidor.
2. Clonar el repositorio (o subir solo lo necesario; en la práctica suele bastar build desde CI y `docker pull`).
3. Crear un archivo `.env` en el servidor (no versionado) con `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, etc.
4. Construir y levantar:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```
5. Si **no** usás `RUN_MIGRATIONS_ON_START=true`, migrar una vez:
   ```bash
   docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate deploy
   ```
6. Colocar un **reverse proxy** (Caddy, Traefik, nginx) delante: TLS, dominio, y proxy pass a `http://127.0.0.1:3000` (o el puerto que mapees).

**Comprobaciones:**

```bash
curl -s https://tu-api.dominio.com/health
# {"status":"ok","database":"up"}
```

## Opción B — Plataforma PaaS (Railway, Render, Fly.io, etc.)

Pasos genéricos (los nombres de menú cambian según el proveedor):

1. **Nuevo proyecto** → conectar el repo Git del API (rama `main` o la que uses).
2. **Añadir recurso PostgreSQL** si la plataforma lo ofrece; copiar la variable `DATABASE_URL` que generen (o construir la URL manualmente).
3. **Servicio Web** desde el mismo Dockerfile en la raíz (`Dockerfile`).
4. **Variables de entorno** del servicio web:
   - `DATABASE_URL` (referencia al Postgres del mismo proyecto, si existe integración).
   - `JWT_SECRET`, `NODE_ENV=production`, `CORS_ORIGIN`.
   - Opcional: `RUN_MIGRATIONS_ON_START=true` la primera vez; luego volver a `false` y usar comando de release para migraciones.
5. **Puerto:** la plataforma suele setear `PORT`; la app ya lo respeta.
6. **Build:** sin comando extra si usás Dockerfile; si el proveedor usa Nixpacks, configurá:
   - Build: `npm ci && npx prisma generate && npm run build`
   - Start: `npx prisma migrate deploy && npm run start:prod` (o solo `npm run start:prod` si migrás en otro paso).

**Railway (orientativo):** servicio Docker desde raíz; Postgres plugin; variables en “Variables”; opción “Deploy” → primera vez ejecutar migraciones desde una shell one-off o habilitar temporalmente `RUN_MIGRATIONS_ON_START`.

## Seguridad en producción

- Rotá `JWT_SECRET` si alguna vez se filtró.
- Usá HTTPS terminado en el proxy o en el balanceador del proveedor.
- Limitá `CORS_ORIGIN` a dominios conocidos.
- Revisá que la URL de Postgres no quede expuesta en logs públicos.

## GitHub Actions (CI y base en la nube)

### CI automático (`.github/workflows/ci.yml`)

En cada **push** o **pull request** a `main` / `master` se ejecutan `npm ci`, validación del esquema Prisma, `prisma generate`, `npm run build` y `npm test`. No se incluye `eslint` hasta que el proyecto pase `npm run lint` sin errores de formato.

### Base en la nube manual (`.github/workflows/cloud-database.yml`)

1. En GitHub: **Settings → Secrets and variables → Actions**, creá **`CLOUD_DATABASE_URL`** con la URL de tu Postgres en la nube (la misma que usarías en `.env` local para apuntar al remoto).
2. **Actions → Cloud database → Run workflow** y elegí el modo:
   - **`migrate`**: solo `prisma migrate deploy` (deja el esquema al día).
   - **`migrate_seed`**: migraciones + `prisma db seed`.
   - **`migrate_seed_repo_sync`**: migraciones + seed + `npm run db:update-and-sync` (importa CSV/JSON y scripts que viven en el repo; útil si tu “verdad” está versionada en git, no solo en tu máquina).
   - **`restore_dump`**: copia **exacta** de una base local. En tu PC: `npm run db:backup`, subí el `.dump` a almacenamiento privado con **URL temporal de descarga** (p. ej. enlace firmado de S3, R2, etc.), guardá esa URL en el secret **`BACKUP_DOWNLOAD_URL`**, ejecutá el workflow en modo `restore_dump`. Usá una **base vacía** recién creada en el proveedor; `--clean` borra objetos existentes antes de importar.

Después de migrar o restaurar, tu API (local o en servidor) puede usar la misma `DATABASE_URL` apuntando a esa instancia.

## Resolución de problemas

| Síntoma | Acción |
|---------|--------|
| `P1001` / 503 “No se pudo conectar a la base” | Verificar `DATABASE_URL`, firewall del proveedor, SSL (`sslmode`), que el Postgres esté “running”. |
| Errores de FK al importar inventario | Primero `register-purchase-lots`, luego `import-inventory-partners` (ver `npm run db:restore-from-repo-data`). |
| API arranca pero el front ve CORS | Definir `CORS_ORIGIN` exactamente con el origen del navegador (esquema + host + puerto si aplica). |
| **502 Bad Gateway** (nginx/Caddy/Cloudflare → API) | El proxy no llega al proceso Node: comprobar que el contenedor/servicio esté **running** (`docker compose ps`, logs), `DATABASE_URL` válida (sin DB la app puede caerse al arrancar), y que `proxy_pass` apunte al **puerto publicado** (p. ej. `http://127.0.0.1:3000` si mapeás `3000:3000`). La API escucha en **`0.0.0.0`** por defecto (`LISTEN_HOST` en `.env` si querés limitar). |
| Build Docker falla | Revisar que existan `package-lock.json`, `prisma/` y `prisma.config.cjs` en el contexto de build. |

## Archivos relevantes en el repo

| Archivo | Uso |
|---------|-----|
| `Dockerfile` | Imagen de producción multi-stage. |
| `docker-compose.prod.yml` | Ejemplo de servicio API + variables. |
| `.dockerignore` | Reduce contexto de build; excluye `prisma/data`. |
| `scripts/docker-entrypoint.sh` | Migraciones opcionales + `node dist/src/main.js`. |
| `README.md` | Desarrollo local, scripts `db:*`, respaldos. |
| `.github/workflows/ci.yml` | CI: build + tests en push/PR. |
| `.github/workflows/cloud-database.yml` | Migraciones / seed / datos del repo / restore desde `.dump` vía URL secreta. |

## Checklist antes de dar por cerrado el deploy

- [ ] `DATABASE_URL` de producción probada con `prisma migrate deploy`.
- [ ] `GET /health` devuelve `database: up`.
- [ ] `JWT_SECRET` fuerte y único en prod.
- [ ] `CORS_ORIGIN` alineado con el front en producción.
- [ ] Datos cargados (seed, restore o dump) si no querés una base vacía.
- [ ] Dominio y TLS configurados.
