# Changelog

## 2026-11-15 — Remediación AUD-VOS-2026-001

Sin versión de producto nueva y sin despliegue. El cambio vive en `fix/audit-vos-2026`.

### Seguridad

- Los seeds y los scripts de alta ya no traen contraseña de respaldo. Una contraseña de ejemplo o demasiado corta detiene el proceso.
- El alta pública de empresas queda cerrada en producción y staging. La solicitud de acceso sigue disponible.
- El administrador de plataforma sale de la base, no de una lista de correos.
- El soporte entra con motivo, en solo lectura, y puede elevarse por un plazo corto sin borrados ni escritura clínica.
- La empresa activa sale del JWT. Otra empresa en la cabecera se rechaza.
- El access token dura 15 minutos. El refresh va en cookie HttpOnly y se puede revocar.
- Google deja de poner el access token en la URL.
- El WebSocket de pedidos se autentica en la primera trama y no cruza empresas.
- El pedido público exige un token opaco. El navegador no puede marcarlo pagado.
- El webhook de Wompi verifica la firma y solo anota el estado del proveedor.
- El mapa de navegación completo exige sesión. La sonda de salud es `GET /health`.
- El asistente público tiene límite por minuto y cupo diario.
- Categorías y el asistente de empresa exigen permiso de lectura.
- En el build de producción no se puede cambiar el API desde `localStorage`.
- El mock de la landing pinta texto, no HTML.

### Producto

- Una clínica nueva incluye el módulo dental en el seed oficial. Si falta un módulo pedido, el onboarding se detiene con un mensaje claro.
- Barberías y servicios dejan de anunciar CRM. Siguen usando los clientes de la agenda.
- La tienda se presenta como toma de pedidos con cobro en caja.

### Impacto para quien ya usa el sistema

- Hay que volver a iniciar sesión. Los token guardados en el navegador dejan de servir en producción en cuanto venza el access token y no exista cookie de refresh.
- Quien opere soporte tiene que escribir un motivo y, para modificar datos, pedir elevación.
- Los pedidos públicos creados antes de la migración no se vuelven a abrir con el enlace viejo.
- El panel de plataforma, al refrescar la sesión, vuelve a la vista de plataforma.

### Listo para el script de despliegue

- El refresh recuerda la empresa y el modo de soporte.
- El cliente de pedidos ya no manda el JWT en la URL del WebSocket.
- Nginx tiene el proxy de ` /backend/shop/ws`.
- `deploy-vos-ia-safe.sh` fija el access token en 15 minutos, cierra el alta pública y aborta si el secreto JWT no sirve.
- Compilación de API y build de producción del front verificados en local. El script del VPS no se ejecutó.

### Pendiente de una decisión o de un ensayo externo

- Rotar secretos y limpiar el historial de Git.
- Aplicar la migración en un entorno controlado.
- Probar Wompi en sandbox antes de hablar de cobro automático.
- Definir qué distingue el plan PRO del plan BUSINESS. Hoy ninguno tiene cupo.
- Dividir los módulos grandes de la interfaz.
