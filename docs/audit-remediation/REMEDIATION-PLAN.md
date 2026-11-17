# Plan de remediación AUD-VOS-2026-001

Rama de trabajo: `fix/audit-vos-2026` en `vos-api` y en `vos-front`. No hay commit ni despliegue. La migración `20261115230000_audit_remediation_security` está escrita y no se aplicó a ninguna base.

## Orden y dependencias

1. S-01 antes que cualquier seed. Sin esto, un entorno nuevo podía nacer con contraseñas de ejemplo.
2. S-05 antes que S-04. El soporte deja de depender de correos compilados y pasa a `users.is_platform_admin`.
3. S-06 depende de `auth_sessions`. El front tiene que leer el access token en memoria y renovarlo con la cookie; si solo cambia el API, la sesión de 15 minutos corta el uso.
4. S-13 depende de que el front envíe la empresa del JWT. Una cabecera distinta ahora responde 403.
5. S-10 depende de que el front deje de usar `GET /navigation` como sonda. La sonda pasó a `GET /health`.
6. S-09 depende de que la tienda guarde el token opaco al crear el pedido. Pedidos anteriores, con hash nulo, no se consultan en público.
7. S-03 es independiente y usa el mismo JWT de S-06, en la primera trama del WebSocket.
8. S-07 y S-14 son de catálogo y onboarding. No dependen de la migración nueva.
9. S-12 puede convivir con el cobro en caja. El webhook no marca `PAID`.
10. S-15, S-16, S-17 y S-18 se apoyan en los controles anteriores. No los sustituyen.

## Alcance de esta ejecución

Fase A, en código: S-01 a S-07, S-16 en login, logout, entrada de soporte, elevación, cambio de plan, borrado de venta y exportación de factura, S-17, S-18 y S-19.

Fase B, en código y con prueba unitaria donde el control es una función: S-08 (aislamiento, sin borrar archivos), S-09, S-10, S-11, S-12 en modo seguro, S-13 y S-14.

Fase C, documentada y sin métricas nuevas de infraestructura: sesiones de 15 minutos con refresh revocable, versión y changelog, política de retención, y la diferencia real de planes PRO y BUSINESS queda bloqueada por decisión de negocio.

## Qué no se hizo

- No se reescribió el historial de Git.
- No se rotaron secretos en el servidor ni en Neon.
- No se ejecutó `prisma migrate deploy`.
- No se levantó la aplicación contra la base real.
- No se partieron `api.ts`, `PurchaseLotsView.tsx`, `ProductsManager.tsx`, `SalesManager.tsx`, `PlatformAdminView.tsx`, `DentalClinicApp.tsx`, `InventoryManager.tsx` ni `App.tsx`. El criterio fue no introducir una regresión visual por una división mecánica.
- No se construyó un CRM.
- No se declaró la tienda como cobro automático.

## API vigente

La aplicación que compila `tsconfig.build.json` usa los módulos `platform-*` y `public-*` importados por `AppModule`. Quedan fuera del build, y cubiertos por `src/app.active-modules.spec.ts`, las carpetas `pos`, `sales`, `inventory`, `recipes`, `purchase-lots`, `gastos`, `admin-expenses`, `stock-movements`, `explorer` y `clients`. Esas carpetas siguen en el disco como referencia. La implementación activa es:

| Recurso | Implementación vigente |
| --- | --- |
| Ventas | `platform-sales` |
| Inventario | `platform-inventory` |
| Compras | `platform-purchases` |
| Recetas | `platform-recipes` y `product-recipes` |
| Caja | `platform-cash-close` |
| Pedidos de tienda | `platform-shop-orders` y `public-shop` |
| Clínica | `platform-dental` |
| Agenda | `platform-booking` |
| Identidad | `auth` |
| Navegación interna | `GET /navigation` con JWT |
| Salud | `GET /health` |
