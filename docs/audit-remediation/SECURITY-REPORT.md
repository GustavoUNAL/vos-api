# Informe de seguridad

Remediación sobre la rama `fix/audit-vos-2026`. No se desplegó y no se aplicó la migración. Este informe no contiene secretos.

## Credenciales

El árbol de trabajo ya no guarda contraseñas reutilizables en el README, en `CREDENTIALS.md`, en los ejemplos de entorno ni como respaldo de los scripts de alta. Esos scripts fallan si la variable falta, si tiene menos de 12 caracteres o si coincide con un valor de ejemplo o con una clave genérica.

Eso no borra lo que ya está en el historial de Git ni lo que ya está cargado en el servidor. Hasta rotar `JWT_SECRET`, las contraseñas de las cuentas afectadas y los secretos de proveedores, el hallazgo sigue mitigado y no cerrado.

## Aislamiento entre empresas

`TenantGuard` toma la empresa del JWT. Si `X-Company-Id` trae otro identificador, responde 403 y no consulta datos. La membresía se busca con el usuario y esa empresa. Un administrador de plataforma dentro de una empresa recibe el rol `platform-support`: solo permisos de lectura, salvo una elevación vigente.

La elevación dura como máximo 120 minutos, exige motivo y no incluye permisos `*.delete` ni escritura clínica. La entrada y la elevación se escriben en `AuditLog`.

El WebSocket de pedidos exige autenticación en la primera trama, cierra si no llega empresa y compara los identificadores con igualdad estricta. Una empresa vacía no significa todas.

La prueba automática cubre la cabecera cruzada, la membresía y el soporte de solo lectura con Prisma simulado. No se hizo el ensayo con dos empresas persistidas.

## Sesiones

El access token dura 15 minutos e incluye `sid`. El refresh viaja en la cookie `vos_refresh` (`HttpOnly`, `SameSite=Lax`, `Secure` en producción, 14 días salvo `AUTH_REFRESH_DAYS`). `POST /auth/refresh` y `POST /auth/logout` exigen la cabecera `X-Vos-Client: web`. Logout revoca la sesión de esa cookie. En producción, un JWT sin `sid` se rechaza salvo que se cambie `AUTH_REJECT_LEGACY_JWT`.

El navegador guarda el access token en memoria, borra `vos_access_token` de `localStorage` y envía `credentials: 'include'`. Un 401 intenta un refresh y, si falla, cierra la sesión. Google ya no pone el access token en la URL: deja la cookie y el hash `google_session=1`.

Queda una ventana de XSS igual a la vida del access token. La cookie de refresh no la lee el script de la página. No hay token de doble envío; la mitigación de CSRF es la cabecera propia, `SameSite=Lax` y la lista de CORS.

## Datos públicos

El pedido de tienda se consulta con slug, código y un token opaco. En base se guarda el SHA-256. El endpoint que confirmaba el pago desde el navegador responde error y no devuelve el pedido.

`GET /navigation` exige sesión. La landing y la sonda usan superficies que no listan el mapa interno. `GET /health` ejecuta `SELECT 1`.

El asistente público queda en 5 peticiones por minuto y en un cupo diario en `public_ai_usage_days`. No se persiste la pregunta. No hay un presupuesto en dinero del proveedor ni un aislamiento por IP más fino que el límite de ritmo.

## Pagos

`POST /public/shop/wompi/events` verifica el checksum documentado por Wompi. Sin secreto responde 503. Con firma válida registra el estado del proveedor y no cambia el pedido a pagado. Los eventos repetidos con el mismo estado no reescriben. Si la referencia coincide con más de un pedido, no actualiza.

La tienda queda descrita como toma de pedidos con cobro en caja.

## Bitácora

`AuditService` escribe login, logout, acceso de soporte, elevación, cambio de plan, borrado de venta y exportación de factura. Redacta claves cuyo nombre sugiere contraseña, token, secreto, cookie o hash. Si la escritura falla, la petición de negocio sigue. La aplicación no ofrece editar ni borrar esas filas.

## Riesgos que siguen abiertos

- Rotación real de cuentas y secretos, y el historial de Git.
- Ensayo de dos empresas en una base desechable.
- Recorrido de login, Google y cambio de empresa en el navegador.
- Sandbox de Wompi.
- Cupo monetario del asistente público.
- Eslint de todo el repositorio. El de CI cubre los archivos de esta remediación.
- Al refrescar, un administrador que estaba dentro de una empresa vuelve a la vista de plataforma.
- Pedidos antiguos sin hash de consulta.
