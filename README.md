# vos.ai-api — Backend VOS AI (NestJS + Prisma)

## Variables de entorno

| Archivo | Uso |
|---------|-----|
| `.env.local` | Desarrollo en tu Mac (`npm run start:dev`) |
| `.env.dev` | Servidor dev/staging (`VOS_ENV=dev`) |

```bash
cp .env.local.example .env.local   # primera vez local
cp .env.dev.example .env.dev       # primera vez servidor dev
```

`.env.local` y `.env.dev` no se commitean.

## Desarrollo local

```bash
npm install
cp .env.local.example .env.local   # editar DATABASE_URL (Neon)
npm run db:migrate
npm run db:seed-platform
npm run start:dev
```

API: http://localhost:3000/health

## Servidor dev

```bash
cp .env.dev.example .env.dev         # editar dominio + Neon + JWT
npm run build
VOS_ENV=dev npm run db:migrate:env
VOS_ENV=dev npm run start:prod:env
```

## Docker (API + front + Postgres opcional)

Desde esta carpeta, con el front en `../vos.ai-front`:

```bash
docker compose --profile full up -d --build
```

- API: http://localhost:3000  
- App: http://localhost:8080  

## Login demo

`admin@vos.ai` / `VosAi2026!`
