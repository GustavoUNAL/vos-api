# vos.ai-api — Backend VOS AI (NestJS + Prisma)

## Variables de entorno

| Entorno | Archivo | Comando |
|---------|---------|---------|
| **Local** | `.env.local` | `npm run start:dev` |
| **Staging** | `.env.dev` | `VOS_ENV=dev npm run start:prod:env` |
| **Producción** | `.env` | `NODE_ENV=production npm run start:prod` |

```bash
cp .env.local.example .env.local       # primera vez local
cp .env.production.example .env        # primera vez VPS
cp .env.dev.example .env.dev           # primera vez staging
```

`.env`, `.env.local` y `.env.dev` no se commitean.

En el **VPS usá solo `.env`** — no copies `.env.local` al servidor.

## Desarrollo local

```bash
npm install
cp .env.local.example .env.local   # editar DATABASE_URL (Neon)
npm run db:migrate
npm run db:seed-platform
npm run start:dev
```

API: http://localhost:3000/health

## Servidor (producción PM2)

Ver `docs/DEPLOY-VPS-PM2.md` y `./scripts/deploy-pm2-vps.sh`.

## Docker (API + front + Postgres opcional)

Desde esta carpeta, con el front en `../vos.ai-front`:

```bash
docker compose --profile full up -d --build
```

- API: http://localhost:3000  
- App: http://localhost:8080  

## Login demo

`admin@vos.ai` / `VosAi2026!`
