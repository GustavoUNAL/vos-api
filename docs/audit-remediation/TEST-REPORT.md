# Informe de pruebas

Fecha: 15 de noviembre de 2026. No se usó la base Neon ni datos reales.

## Línea base, antes de esta remediación

`npm test` en `vos-api`: 16 suites en verde, 57 pruebas en verde, 1 suite sin arrancar. La suite `purchase-lots-total-value-validation.spec.ts` fallaba al cargar `CategoryType` desde el cliente de Prisma. El CI no ejecutaba e2e ni eslint. El front no tenía pruebas.

## Comandos de esta verificación

En `vos-api`:

```bash
./node_modules/.bin/prisma generate
./node_modules/.bin/tsc --noEmit -p tsconfig.build.json
npm test -- --forceExit
npm run test:e2e -- --forceExit
./node_modules/.bin/eslint src/common/security-policy.ts src/common/security-policy.spec.ts src/common/wompi-signature.ts src/common/wompi-signature.spec.ts src/common/shop-access-token.ts src/common/shop-access-token.spec.ts src/tenant/tenant.guard.ts src/tenant/tenant.guard.spec.ts src/auth/auth-cookie.ts src/auth/auth-session.service.ts src/audit/audit.service.ts src/app.active-modules.spec.ts --max-warnings 0
```

En `vos-front`:

```bash
./node_modules/.bin/tsc -b --pretty false
./node_modules/.bin/eslint src/api.ts src/App.tsx src/backendHealth.ts src/lib/presetCredentials.ts src/lib/authRoutes.ts src/pos/services/websocket.ts src/shop/shopApi.ts src/shop/PublicShopApp.tsx src/components/PlatformAdminView.tsx src/components/GoogleAuthPopupView.tsx --max-warnings 0
```

## Resultado

| Comando | Resultado |
| --- | --- |
| Prisma generate | Cliente 7.6.0 generado |
| `tsc` del API | Sin errores |
| `npm test` | 22 suites, 71 pruebas, todas en verde |
| `npm run test:e2e` | 1 suite, 2 pruebas, en verde |
| Eslint de los controles nuevos del API | Sin errores |
| `tsc -b` del front | Sin errores |
| Eslint de los archivos de sesión y tienda | Sin errores |

La suite de compras que no arrancaba volvió a ejecutarse después de armar el prefijo de categoría con los literales `PRODUCT`, `INVENTORY` y `EXPENSE`, que son los valores del enum.

## Qué cubren las pruebas nuevas

- Contraseña obligatoria, corta, genérica y propia.
- Alta pública cerrada en producción y staging.
- Límite de ritmo en producción y staging, y salto en test.
- Cabecera de empresa distinta, ausente e igual.
- Entrega de eventos de pedidos solo a la misma empresa.
- Soporte de solo lectura y elevación sin borrados ni clínica.
- Firma de Wompi válida e inválida.
- Token opaco de pedido y su hash.
- Guard de tenant: otra empresa, membresía propia y soporte sin escritura.
- `AppModule` no importa los módulos legacy.
- Google no pone el JWT en la URL.
- `GET /` responde `vos-api` y `GET /health` responde sin sesión, con Prisma simulado.

## Errores encontrados y corregidos durante la verificación

- `ensurePlatformAdminFlag` no aceptaba `id` ni `email`. Se pasó solo la bandera. `tsc` quedó en verde.
- La prueba de módulos activos usaba `toContain('SalesModule')` y coincidía con `PlatformSalesModule`. Pasó a buscar el import exacto.
- `tsc -b` del front, lanzado una vez sin respetar `noEmit`, escribió `.js` al lado de las fuentes. Esos archivos se borraron y no forman parte del cambio.
- Eslint marcó formato y dos retornos inseguros en auditoría y en la firma. Se corrigieron y el lint acotado quedó en verde.

## Qué no se ejecutó

- Venta POS, cierre de caja, reserva pública y alta de clínica contra una base.
- Dos empresas reales, dos sockets y un usuario de soporte persistido.
- Login, Google, refresh y cambio de empresa en el navegador.
- Webhook de Wompi contra el sandbox.
- `prisma migrate deploy`.
- Eslint de todo `vos-api` y de `LandingChatMock.tsx`, que conserva avisos previos del efecto de animación.

Esos huecos son la razón de que los hallazgos queden en MITIGADO aunque el código y las pruebas unitarias estén en verde.
