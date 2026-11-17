# Guía de despliegue

No se desplegó producción ni staging en esta pasada. El build de API y el build de producción del front sí se ejecutaron en local y terminaron bien.

El script del VPS es `vos-api/scripts/deploy-vos-ia-safe.sh`. Solo hace fast-forward de `origin/main` en `vos-api` y en `vos-front`. Hay que tener este commit en `origin/main` de los dos repositorios antes de ejecutarlo. El script aplica la migración y reinicia PM2; no corre seeds.

## Antes de tocar el servidor

1. Copia de seguridad de la base. La migración solo agrega `auth_sessions`, `public_ai_usage_days` y dos columnas en `shop_orders`. Aun así, el respaldo es previo a cualquier `migrate deploy`.
2. Rotar las contraseñas de las cuentas que llegaron a estar escritas en Git y rotar `JWT_SECRET`, el secreto de Google, las claves de Wompi, OpenAI, Telegram, Twilio y Stripe si alguna vez estuvieron en un archivo versionado. El detalle operativo está en `CREDENTIALS.md`. No pegar los valores nuevos en el repositorio.
3. Anotar la revisión actual del proceso para poder volver al build anterior.

## Variables

Definir en el entorno, no en Git:

- `JWT_SECRET` nuevo, de al menos 32 caracteres.
- `JWT_EXPIRES_IN=15m`. El script de despliegue lo escribe en el `.env` del VPS sin tocar `JWT_SECRET` ni `DATABASE_URL`.
- `AUTH_REFRESH_DAYS=14`.
- `AUTH_PUBLIC_REGISTER=false` en staging y producción. El script también lo deja en `false`. Si `JWT_SECRET` tiene menos de 32 caracteres o parece un ejemplo, el script se detiene antes de instalar.
- `AUTH_REJECT_LEGACY_JWT` sin definir, o `true` en producción. Con el código nuevo, producción ya rechaza JWT sin `sid`.
- `SEED_*_EMAIL` y `SEED_*_PASSWORD` solo si se va a correr un seed. Contraseña propia de 12 caracteres o más. Sin estas variables el seed se detiene.
- `THROTTLE_LIMIT` opcional. Si no está, producción usa 120 por minuto y staging 300.
- `PUBLIC_AI_DAILY_LIMIT` opcional. El valor de código es 200 peticiones por día.
- `WOMPI_EVENTS_SECRET` solo cuando se quiera recibir el webhook. Mientras falte, el endpoint responde 503 y la tienda sigue en cobro en caja.
- `VITE_API_URL` en el build del front. En producción el navegador ya no puede sustituirla con `localStorage`.

`VOS_ENV=dev` o `staging` activa el límite de ritmo aunque alguien arranque el proceso fuera de `NODE_ENV=production`.

## Migración

```bash
npm run db:generate
npx prisma migrate deploy
```

Aplicar solo `20261115230000_audit_remediation_security`. No correr `migrate reset` ni el seed legacy. `npm run db:seed` ahora termina en error a propósito. El seed vigente, si hace falta un entorno nuevo, es `npm run db:seed-platform` con variables propias.

Los pedidos ya creados quedan con `access_token_hash` nulo. Esos pedidos no se consultan por la tienda pública. El cobro en caja no depende de esa columna.

## Build

API: `npm ci`, `npm run build`, reiniciar el proceso con el entorno nuevo.

Front: `npm ci`, `npm run build` con `VITE_API_URL` apuntando al API del mismo sitio. El refresh usa cookie, así que el front y el API deben compartir sitio o un proxy que reenvíe `Cookie` y `Set-Cookie`. CORS ya permite credenciales; el origen tiene que estar en `CORS_ORIGIN`.

## CI

El workflow del API valida Prisma, compila, corre `npm test`, corre el e2e ligero y el eslint de los archivos de esta remediación. El del front compila y lint de los archivos de sesión y tienda. Ninguno despliega.

## Sesión y pedidos en vivo

El refresh conserva la empresa activa y, si corresponde, el modo de soporte. Está guardado en `auth_sessions`, no se deduce de la primera membresía.

El WebSocket de pedidos va a `wss://vos-ia.com/backend/shop/ws` y se autentica en el primer mensaje. Nginx necesita el `location /backend/shop/ws` con `Upgrade`, que ya está en `deploy/nginx-vos-ia.443.conf.example`. `fix-vos-ia-https.sh` usa ese archivo. Sin ese bloque, la API responde y la tienda carga, pero el tablero no recibe pedidos en vivo.

Quien ya tenía sesión en el navegador tiene que volver a entrar. El access token anterior no trae `sid`.

## Después del arranque

1. `GET /health` responde `{ "status": "ok", "database": "up" }`.
2. Un login nuevo deja `Set-Cookie` de `vos_refresh` y un access token en el JSON. La URL no lleva el token.
3. `POST /auth/register` en producción responde prohibido.
4. `GET /navigation` sin sesión responde 401. `GET /navigation/public` no lista endpoints.
5. Entrar a una empresa desde plataforma pide motivo y la sesión queda de solo lectura.
6. Un `X-Company-Id` de otra empresa responde 403.
7. `POST /public/shop/wompi/events` responde 503 mientras no exista el secreto.

## Rollback

Si la migración todavía no se aplicó, volver al build anterior alcanza.

Si ya se aplicó, el build anterior ignora `auth_sessions` y las columnas nuevas. Los pedidos siguen. Las sesiones nuevas dejan de existir para ese build y los usuarios vuelven al JWT largo si el build anterior lo emitía. No borrar las tablas nuevas en el mismo movimiento: primero estabilizar el build y después decidir si se revierten con una migración explícita.

Volver el código nuevo hacia atrás sin rotar `JWT_SECRET` no cierra las sesiones que ya se emitieron con el secreto anterior.
