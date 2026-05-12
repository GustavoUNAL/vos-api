# Respaldos locales (`pg_dump`)

Aquí escribe **`npm run db:backup`** archivos `arandano-YYYYMMDD-HHMMSS.dump`.

- **No subas** estos archivos al repositorio (están en `.gitignore`).
- Copia los `.dump` a otro disco, nube o el servidor de respaldo antes de:
  - `docker compose down -v` (borra el volumen y **toda** la base local)
  - formatear la máquina

Restaurar en una base vacía o reemplazar contenido:

```bash
npm run db:restore-backup -- backups/arandano-....dump
```

En producción / Railway suele bastar con que el proveedor Postgres **persista** por defecto; para sincronizar entre máquinas usa también `npm run db:pg-copy-database` (pull/push con `REMOTE_DATABASE_URL` en `.env`).
