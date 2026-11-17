# Credenciales

Este archivo ya no contiene contraseñas, tokens ni correos operativos.

## Qué pasó

Versiones anteriores del repositorio incluyeron contraseñas de demostración y correos de acceso en la documentación, en los scripts de seed y en archivos de ejemplo. Borrarlas del árbol actual no las borra del historial de Git. Hay que tratarlas como comprometidas.

## Rotación obligatoria

1. Generar una contraseña nueva, única y de al menos 12 caracteres para cada cuenta que haya usado un valor publicado (administración de plataforma, propietarios de empresas de demostración y operadores creados por scripts).
2. Cambiarla desde la aplicación o, si la sesión ya no es confiable, actualizar el hash directamente en la base con un script que lea la nueva contraseña solo desde el entorno.
3. Rotar `JWT_SECRET`. Al cambiarlo, todas las sesiones de acceso vigentes dejan de ser válidas.
4. Revocar las sesiones de refresco existentes. Después de aplicar la migración de `auth_sessions`, un `DELETE` controlado de esa tabla cierra los refresh tokens. No borra usuarios ni datos de negocio.
5. Rotar secretos de proveedores que hayan estado en archivos versionados: `GOOGLE_CLIENT_SECRET`, `WOMPI_PRIVATE_KEY`, `WOMPI_EVENTS_SECRET`, `OPENAI_API_KEY`, tokens de Telegram, Twilio y Stripe.
6. No reescribir el historial de Git compartido sin un acuerdo explícito. La limpieza de historia exige coordinación con quien ya clonó el repositorio y no se hace en este cambio.

## Cómo quedan los entornos

- El seed y los scripts de alta fallan si falta la contraseña o si coincide con un valor de ejemplo.
- `AUTH_PUBLIC_REGISTER` queda en `false` en los ejemplos de staging y producción. El alta pública de empresas no se abre sola en esos entornos.
- `JWT_EXPIRES_IN` de ejemplo es `15m`. El refresh vive en cookie `httpOnly`.
- Los archivos `.env`, `.env.local` y `.env.dev` siguen fuera de Git. Los `.example` solo muestran nombres de variables vacíos.
